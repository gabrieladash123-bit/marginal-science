"""Reproducible grouped evaluation and portable TF-IDF/logistic inference export."""
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import time
import unicodedata
import zipfile
from collections import Counter
from datetime import datetime, timezone

import numpy as np
import sklearn
from scipy.optimize import minimize_scalar
from scipy.special import softmax
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, log_loss
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from fetch_data import fetch, COMMIT, URL

ROOT = Path(__file__).resolve().parent
SEED = 1729
LABELS = ["human", "revised", "generated"]
csv.field_size_limit(32 * 1024 * 1024)


def tokens(text):
    text = unicodedata.normalize("NFKC", text).lower().replace("’", "'")
    text = re.sub(r"@math\d+", " ", text)
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text)


def main():
    started = time.perf_counter()
    path = fetch()
    with zipfile.ZipFile(path) as archive:
        member = next(name for name in archive.namelist() if name.endswith(".csv") and not name.startswith("__MACOSX"))
        with archive.open(member) as handle:
            reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig"))
            print("Columns:", reader.fieldnames, flush=True)
            rows = []
            for row in reader:
                row = {key.strip().lower(): value for key, value in row.items() if key}
                texts = [row.get(key, "").strip() for key in ("hgt", "art", "agt")]
                if all(len(tokens(text)) >= 40 for text in texts):
                    rows.append({"texts": texts, "domain": row.get("category", "Unknown"), "source": row.get("source", "Unknown")})
    if len(rows) < 300:
        raise RuntimeError(f"Too few complete paper triplets: {len(rows)}")

    # Connect papers sharing ANY normalized text. No exact abstract duplicate or
    # version of the same paper may cross train/validation/test boundaries.
    parent = list(range(len(rows)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    seen = {}
    for index, row in enumerate(rows):
        for text in row["texts"]:
            key = hashlib.sha256(" ".join(tokens(text)).encode()).hexdigest()
            if key in seen:
                parent[find(index)] = find(seen[key])
            seen[key] = index
    roots = sorted(set(find(i) for i in range(len(rows))))
    domains = [rows[i]["domain"] for i in roots]
    counts = Counter(domains)
    stratify = domains if min(counts.values()) >= 5 else None
    train_groups, rest = train_test_split(roots, test_size=.4, random_state=SEED, stratify=stratify)
    rest_domains = [rows[i]["domain"] for i in rest]
    val_groups, test_groups = train_test_split(rest, test_size=.5, random_state=SEED, stratify=rest_domains if min(Counter(rest_domains).values()) >= 2 else None)
    partitions = [set(train_groups), set(val_groups), set(test_groups)]
    assert all(not partitions[i] & partitions[j] for i in range(3) for j in range(i))
    splits = []
    fingerprints = []
    for groups in partitions:
        texts, targets, domain, paper_ids = [], [], [], []
        for index, row in enumerate(rows):
            if find(index) in groups:
                texts.extend(row["texts"])
                targets.extend(range(3))
                domain.extend([row["domain"]] * 3)
                paper_ids.extend([index] * 3)
        splits.append((texts, np.array(targets), domain, np.array(paper_ids)))
        fingerprints.append(set(hashlib.sha256(" ".join(tokens(t)).encode()).hexdigest() for t in texts))
    assert all(not fingerprints[i] & fingerprints[j] for i in range(3) for j in range(i))
    print("Split samples:", [len(split[0]) for split in splits], flush=True)
    vectorizer = TfidfVectorizer(tokenizer=tokens, token_pattern=None, lowercase=False, ngram_range=(1, 2), min_df=4, max_features=18000, sublinear_tf=True)
    x_train = vectorizer.fit_transform(splits[0][0])
    x_val, x_test = [vectorizer.transform(split[0]) for split in splits[1:]]
    y_train, y_val, y_test = [split[1] for split in splits]
    experiments, candidates = [], []
    for strength in [.5, 2., 6.]:
        model = LogisticRegression(C=strength, max_iter=600, random_state=SEED)
        model.fit(x_train, y_train)
        prediction = model.predict(x_val)
        score = float(f1_score(y_val, prediction, average="macro"))
        experiments.append({"name": f"Logistic regression C={strength:g}", "c": strength, "validationMacroF1": score, "validationAccuracy": float(accuracy_score(y_val, prediction))})
        candidates.append(model)
        print(experiments[-1], flush=True)
    selected = max(range(len(candidates)), key=lambda i: experiments[i]["validationMacroF1"])
    model = candidates[selected]
    validation_logits = model.decision_function(x_val)
    temperature = float(minimize_scalar(lambda t: log_loss(y_val, softmax(validation_logits / t, axis=1)), bounds=(.4, 4.), method="bounded").x)
    probabilities = softmax(model.decision_function(x_test) / temperature, axis=1)
    predictions = probabilities.argmax(axis=1)
    baseline = MultinomialNB().fit(x_train, y_train)
    naive = baseline.predict(x_test)
    confidence = probabilities.max(axis=1)
    accepted = confidence >= .65
    reliability, ece = [], 0.
    for lower in np.arange(0, 1, .1):
        mask = (confidence >= lower) & (confidence < lower + .1 + (1e-9 if lower > .8 else 0))
        if mask.any():
            average = float(confidence[mask].mean())
            accuracy = float((predictions[mask] == y_test[mask]).mean())
            ece += abs(average - accuracy) * float(mask.mean())
            reliability.append({"confidence": average, "accuracy": accuracy, "count": int(mask.sum())})
    domain_metrics = []
    for domain in sorted(set(splits[2][2])):
        mask = np.array(splits[2][2]) == domain
        domain_metrics.append({"domain": domain, "samples": int(mask.sum()), "accuracy": float(accuracy_score(y_test[mask], predictions[mask])), "macroF1": float(f1_score(y_test[mask], predictions[mask], average="macro"))})
    artifact = {"schemaVersion": 1, "classes": LABELS, "vocabulary": {k: int(v) for k, v in vectorizer.vocabulary_.items()}, "idf": vectorizer.idf_.tolist(), "weights": model.coef_.tolist(), "intercept": model.intercept_.tolist(), "temperature": temperature, "datasetCommit": COMMIT}
    output = ROOT / "artifacts"
    output.mkdir(exist_ok=True)
    encoded = json.dumps(artifact, separators=(",", ":"), ensure_ascii=True)
    (output / "detector.json").write_text(encoded, encoding="utf-8")
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    # Group bootstrap: retain correlated versions of each paper in every draw.
    rng = np.random.default_rng(SEED)
    papers = sorted(set(splits[2][3].tolist()))
    correctness = {i: (predictions[splits[2][3] == i] == y_test[splits[2][3] == i]).astype(float) for i in papers}
    boot = [np.concatenate([correctness[int(i)] for i in rng.choice(papers, len(papers), replace=True)]).mean() for _ in range(400)]
    report = {"name": "Scientific abstract classifier", "version": "scihra-tfidf-1", "trainedAt": datetime.now(timezone.utc).isoformat(), "seed": SEED, "modelSha256": digest,
        "dataset": {"name": "SciHRA-Detect", "url": "https://github.com/mithuGit/SciHRA-Detect", "commit": COMMIT, "download": URL, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "papers": len(rows), "groups": len(roots), "samples": len(rows) * 3, "domains": len(set(r["domain"] for r in rows)), "generator": "GPT-4o", "author": "Mithusan Naguleswaran", "license": "Apache-2.0 repository license"},
        "split": {name: {"samples": len(split[0]), "papers": len(set(split[3].tolist())), "groups": len(groups)} for name, split, groups in zip(["train", "validation", "test"], splits, partitions)},
        "features": len(vectorizer.vocabulary_), "selectedC": experiments[selected]["c"], "temperature": temperature, "experiments": experiments,
        "test": {"accuracy": float(accuracy_score(y_test, predictions)), "macroF1": float(f1_score(y_test, predictions, average="macro")), "logLoss": float(log_loss(y_test, probabilities)), "ece": ece, "accuracyInterval": np.quantile(boot, [.025, .975]).tolist(), "coverage": float(accepted.mean()), "selectiveAccuracy": float((predictions[accepted] == y_test[accepted]).mean()) if accepted.any() else 0., "humanFalsePositiveRate": float(((predictions[y_test == 0] != 0) & accepted[y_test == 0]).mean()), "confusion": confusion_matrix(y_test, predictions).tolist(), "perClass": classification_report(y_test, predictions, target_names=LABELS, output_dict=True), "domains": domain_metrics, "reliability": reliability},
        "baselines": [{"name": "Uniform chance", "accuracy": 1/3, "macroF1": 1/3}, {"name": "Multinomial Naive Bayes", "accuracy": float(accuracy_score(y_test, naive)), "macroF1": float(f1_score(y_test, naive, average="macro"))}],
        "checks": {"paperOverlap": 0, "exactTextOverlap": 0, "vectorizerFit": "training only", "hyperparameterSelection": "validation only", "temperatureFit": "validation only", "testUse": "final evaluation only"},
        "limitations": ["English scientific abstracts from one public corpus; performance on other writing and newer generators is unvalidated.", "Dataset style, source formatting and topic can confound classification. Scores do not establish authorship.", "Human, AI-revised and AI-generated references overlap. Mixed writing and short passages may be indeterminate.", "Revisions require author review; no automated test can guarantee preservation of every scientific claim."], "trainingSeconds": round(time.perf_counter() - started, 2), "libraries": {"scikit-learn": sklearn.__version__, "numpy": np.__version__}}
    (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    probes = ["We examine uncertainty in language models and evaluate calibration on scientific abstracts. The analysis considers confidence intervals, paired comparisons, and changes in the input distribution.", "In conclusion, this comprehensive study highlights the significant potential of an innovative framework. Furthermore, the findings underscore the importance of future research and practical applications.", "We don't infer causality from p < 0.05. The sample contains 240 observations [12]. $x^2 + y^2$ and @math12 are preserved; naïve measurements require further analysis."]
    parity = [{"text": text, "probabilities": softmax(model.decision_function(vectorizer.transform([text]))[0] / temperature).tolist()} for text in probes]
    (output / "parity.json").write_text(json.dumps(parity, indent=2), encoding="utf-8")
    print(json.dumps({"accuracy": report["test"]["accuracy"], "macroF1": report["test"]["macroF1"], "features": report["features"], "modelSha256": digest}), flush=True)


if __name__ == "__main__":
    main()
