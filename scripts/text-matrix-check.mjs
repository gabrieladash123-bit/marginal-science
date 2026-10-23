import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {scientificTexts} from '../tests/fixtures/scientific-texts.ts';
import {humanizeInputError,humanizeText,validateHumanized} from '../lib/humanize.ts';
import {anchors} from '../lib/integrity.ts';
import {protectedValues} from '../lib/writing.ts';

const base=process.env.APP_URL??'http://127.0.0.1:5188';
const neural=process.env.TEST_NEURAL==='1';
await mkdir('artifacts/browser',{recursive:true});
const context=await chromium.launchPersistentContext('artifacts/browser/text-matrix-profile',{channel:process.env.BROWSER_CHANNEL??(process.env.CI?undefined:'chrome'),headless:true,viewport:{width:1440,height:1000}});
const report={base,illustrativeTexts:true,texts:scientificTexts.length,phraseResults:[],modelResults:[],errors:[]};
let failure;
try{
  const page=context.pages()[0]??await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  await page.getByRole('tab',{name:'Humanize',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Scientific abstract',exact:true});const panel=page.getByRole('region',{name:'Text humanizer'});
  const output=panel.getByLabel('Humanized draft',{exact:true});
  for(const fixture of scientificTexts){
    for(const style of ['natural','concise']){
      // Textareas normalize Windows line endings; use the exact browser value as the source.
      await editor.fill(fixture.text);await panel.getByRole('radio',{name:style==='natural'?'Natural academic':'Concise academic',exact:false}).check();
      const source=await editor.inputValue();const button=panel.getByRole('button',{name:'Humanize text',exact:true});
      if(humanizeInputError(source)){await expect(button).toBeDisabled();report.phraseResults.push({id:fixture.id,style,outcome:'input rejected'});continue;}
      await button.click();await expect(editor).toHaveValue(source);
      if(fixture.expected[style]==='blocked'){await expect(panel.getByRole('alert')).toContainText('preservation checks');await expect(output).toHaveCount(0);report.phraseResults.push({id:fixture.id,style,outcome:'unsafe shortening blocked'});continue;}
      const expected=humanizeText(source,style);
      if(!expected.changed){await expect(panel.getByRole('status')).toContainText('No matching phrases');await expect(output).toHaveCount(0);report.phraseResults.push({id:fixture.id,style,outcome:'unchanged'});continue;}
      await expect(output).toHaveText(expected.text);const revised=await output.textContent();
      assert.deepEqual(protectedValues(revised),protectedValues(source));assert.deepEqual(anchors(revised),anchors(source));
      assert.equal(validateHumanized(source,revised),true);
      assert.equal(await page.evaluate(()=>window.fixtureExecuted),undefined);assert.equal(await output.locator('img,script').count(),0);
      await panel.getByRole('button',{name:'Apply humanized draft',exact:true}).click();await expect(editor).toHaveValue(revised);
      await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(editor).toHaveValue(source);
      report.phraseResults.push({id:fixture.id,style,outcome:'revised, applied and undone',edits:expected.edits.length,source,revised});
    }
    console.log(JSON.stringify({fixture:fixture.id,phraseChecks:'passed'}));
  }
  if(neural){
    for(const fixture of scientificTexts.filter(fixture=>fixture.neural)){
      await editor.fill(fixture.text);const source=await editor.inputValue();
      await panel.getByRole('button',{name:'Generate a draft',exact:true}).click();
      await expect(panel.getByRole('button',{name:'Generate a draft',exact:true})).toBeVisible({timeout:330000});
      await expect(editor).toHaveValue(source);
      if(await panel.getByRole('alert').count())throw new Error(`${fixture.id}: ${await panel.getByRole('alert').textContent()}`);
      if(await output.count()){
        const revised=await output.textContent();assert.notEqual(revised,source);assert.equal(validateHumanized(source,revised),true);
        assert.deepEqual(protectedValues(revised),protectedValues(source));assert.deepEqual(anchors(revised),anchors(source));
        await panel.getByRole('button',{name:'Apply humanized draft',exact:true}).click();await expect(editor).toHaveValue(revised);
        await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(editor).toHaveValue(source);
        report.modelResults.push({id:fixture.id,outcome:'revised, applied and undone',source,revised});
      }else{
        await expect(panel.getByRole('status')).toContainText('No model edits passed');report.modelResults.push({id:fixture.id,outcome:'unchanged: no safe model edits',source});
      }
      console.log(JSON.stringify(report.modelResults.at(-1)));
    }
    assert.ok(report.modelResults.some(result=>result.outcome==='revised, applied and undone'),'No fixture produced a usable model revision.');
  }
  assert.equal(report.phraseResults.length,scientificTexts.length*2);assert.deepEqual(report.errors,[]);
}catch(reason){failure=reason;report.failure=reason instanceof Error?reason.message:String(reason);}
finally{await writeFile('artifacts/browser/text-matrix.json',JSON.stringify(report,null,2));await context.close();}
console.log(JSON.stringify({texts:report.texts,phraseChecks:report.phraseResults.length,modelChecks:report.modelResults.length,modelRevisions:report.modelResults.filter(result=>result.outcome==='revised, applied and undone').length,errors:report.errors,failure:report.failure??null}));
if(failure)throw failure;
