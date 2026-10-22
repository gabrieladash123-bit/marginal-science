# Marginal

A scientific-writing ML portfolio project: an evaluated three-class text classifier, an editable manuscript workspace, reviewed clarity edits, and optional browser-local neural rewriting.

[Open the live workspace](https://marginal-science.vercel.app)

## Run

```bash
npm ci
npm run dev
```

The committed model artifact and evaluation report make the application immediately runnable. Node.js 24 is required. No API key is required. The Vite development server exposes the same analysis handler used by Vercel.

The serving model was trained by [the reproducible Linux workflow](https://github.com/gabrieladash123-bit/marginal-science/actions/runs/39125456058). It uses 8,796 abstracts from 2,932 complete paper triplets. The held-out set contains 1,761 abstracts from 587 papers: macro F1 0.95969 and accuracy 0.95968. These are within-corpus results, not a general authorship-detection guarantee. The `Train scientific model` workflow can regenerate the artifacts from the pinned source.

## Reproduce training

Use Python 3.12 and an isolated environment:

```bash
python -m venv .venv
# Activate the environment for your shell.
pip install -r ml/requirements.txt
python ml/fetch_data.py
python ml/train.py
npm test
npm run build
```

The download is pinned to SciHRA-Detect commit `99fa3644a68563081a14fcbda7842b20f358cb91` and verified against its Git blob. The raw corpus is ignored by Git. The model learns human-written, GPT-4o-revised, and GPT-4o-generated abstract reference labels. The application scores similarity to that corpus; this does not establish authorship or generalize to all generators.

Paper triplets and exact normalized duplicate texts form connected groups. The split keeps those groups disjoint. Vocabulary fitting uses training data only; hyperparameter selection and temperature scaling use validation data; the held-out test set is used for final evaluation. The model report includes class/domain metrics, a confusion matrix, paper-bootstrap accuracy intervals, confidence coverage, false positives, and calibration error. It reports this implementation's measurements rather than numbers from the source paper.

## System

`ml/train.py` exports a sparse TF-IDF/logistic model into `ml/artifacts/detector.json`. The TypeScript serving implementation reproduces the tokenizer, unigram/bigram counts, sublinear term frequency, IDF, L2 normalization, logits, and temperature-scaled softmax. Node tests compare it with exported scikit-learn predictions. `api/analyze.ts` serves bounded inference on Vercel; raw submitted text is not persisted by the app.

The UI returns inconclusive for confidence below 65%, known-vocabulary coverage below 55%, or fewer than 80 words. Analysis accepts 60–1,200 words, but longer sections and non-abstract text are outside the evaluated domain. These are operational guards, not proof that remaining predictions are reliable on new sources.

## Revision

Clarity review applies explicit, individually selectable phrase edits, with undo. Citations, numerical values, quotations, uppercase notation and Greek symbols are checked before applying a draft. These checks cannot prove preservation of every scientific claim; the author reviews meaning.

The optional local model is `Xenova/LaMini-Flan-T5-77M`, pinned to revision `ac7ed8dcdab558daa9d648678e8545a919a81f85`, through Transformers.js 3.8.1. It downloads about 120 MB including the runtime on first use and runs in a web worker. It supports drafts up to 220 words, with cancellation and a five-minute timeout. Each pass reviews at most two sentences of 8–45 words, prioritizing matching clarity phrases, then length. Failed protected-value, lexical-retention or explicit qualifier checks retain that original sentence; sentences outside the pass also remain intact. A final manuscript check runs before review. These checks cannot establish semantic equivalence. The conservative clarity tool remains available when the model fails or downloads are blocked. The app does not optimize text against detector scores or promise detector evasion.

## Research notebook

The workspace now includes a research notebook with three connected tools:

- **Claim change ledger.** Save up to eight checkpoints, select a baseline, and compare it with the editable current draft. Exact normalized sentences match first; remaining sentences use a deterministic greedy word-set alignment with a 0.38 overlap threshold. Each sentence is assigned at most once. The ledger tracks changed quantities/comparators/units, citation spans, negation wording, removed uncertainty markers and association-to-causation wording. Added, removed and shifted sentences remain inspectable. Expand a row for a word diff. Checkpoint restoration has an undo path.
- **Model robustness probes.** `/api/robustness` runs whitespace normalization, Unicode normalization, citation ablation, sentence-order reversal and opening-sentence ablation with the serving classifier. Results include probability shifts, Jensen–Shannon divergence in bits, decision changes and vocabulary coverage. Out-of-bounds ablations are explicitly skipped. The client verifies input/model identity, probability normalization, derived labels and summary measurements; editing or cancelling invalidates outstanding results.
- **Portable review records.** Export both drafts, the audit engine version, classifier identity and a recomputable ledger in a JSON record with a SHA-256 checksum. Import checks the checksum, model identity, structure and recomputed audit before restoring the draft. The prior draft becomes a checkpoint. Probe measurements can also be exported separately.

The built-in comparison is an illustrative observational-study abstract, with deliberately changed participant counts and stronger claims. It is authored demo text, not a real study. Checkpoints stay in tab memory; export a review before reloading or closing the page. The app does not persist manuscript text.

Comparisons support 18,000 characters and 120 sentences per draft. Sentence alignment and scientific-language checks are heuristics: similar claims can be matched ambiguously, implicit changes can be missed, and formatting can produce flags. Citation detection does not verify source existence or evidence quality. Authors review scientific meaning. Review files are unsigned; a checksum detects content changes against the supplied checksum and cannot authenticate the creator or prevent someone generating a new record. Stability probes describe this draft; order and omission probes change information or context. Reported benchmark metrics apply to the existing classifier.

## Verification and deployment

```bash
npm test
npm run test:runtime
npm run build
vercel --prod
```

`/api/health` exposes serving model identity. `/api/analyze` accepts JSON `{ "text": "..." }` via POST and returns probabilities, uncertainty, term contributions, writing statistics, and measured model-inference time. Responses disable caching. The API rejects invalid/oversized input without echoing text in errors. A deployment needs no database or credential to run its main workflow.

`node scripts/check-deployment.mjs` checks the public API against local predictions and verifies input rejection. `APP_URL=https://marginal-science.vercel.app node scripts/browser-check.mjs` checks the deployed editor, revision review, undo, navigation and responsive layouts (requires Chrome). The manually dispatched `Verify browser-local rewrite` workflow starts the app, checks model downloading, draft generation, application and undo in Chromium, and saves its report and screenshot as an artifact.

`Verify public deployment` runs the API parity and responsive browser checks against the public Vercel URL from a Linux runner, independently of the developer's local network.

`APP_URL=http://127.0.0.1:5188 node scripts/notebook-check.mjs` checks the notebook against a production preview, including real probes, checkpoint restoration/undo, export/import, altered files, size limits, failed requests, wrong-source responses, cancellation, stale requests, keyboard details, inert text and responsive layouts. The `Verify research notebook` workflow runs those checks against production in Chromium and Firefox, retaining JSON reports and screenshots. Unit tests include 500 deterministic probability-distance cases, artifact parity, audit bounds and forged-audit rejection. `npm run test:runtime` exercises the compiled analysis and robustness entry points.

## Attribution

- Dataset: [SciHRA-Detect](https://github.com/mithuGit/SciHRA-Detect), Mithusan Naguleswaran, TU Darmstadt, 2025. Repository license: Apache 2.0. Original publications retain their rights; full texts are not bundled or redistributed here.
- Browser rewrite model: [LaMini-Flan-T5-77M](https://huggingface.co/Xenova/LaMini-Flan-T5-77M), ONNX conversion by Xenova of MBZUAI's model. Model files are fetched from their original host; see its model card and license.
- Default workspace abstracts are illustrative examples authored for this demonstration and are not experimental findings.
