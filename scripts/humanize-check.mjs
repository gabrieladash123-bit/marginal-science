import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {humanizeText,validateHumanized} from '../lib/humanize.ts';

const base=process.env.APP_URL??'http://127.0.0.1:5188';
await mkdir('artifacts/browser',{recursive:true});
const browser=await chromium.launch({channel:process.env.CI?undefined:'chrome',headless:true});
const checks=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle'});
  const editor=page.getByRole('textbox',{name:'Scientific abstract',exact:true});
  const original=await editor.inputValue();
  await page.locator('.editor-actions').getByRole('button',{name:'Humanize text',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Humanize',exact:true})).toBeFocused();
  await expect(page.getByRole('heading',{name:'Clearer language. Your meaning.'})).toBeVisible();checks.push('visible humanize entry');
  const panel=page.getByRole('region',{name:'Text humanizer'});const output=panel.getByLabel('Humanized draft',{exact:true});
  await panel.getByRole('button',{name:'Humanize text',exact:true}).click();
  const natural=humanizeText(original,'natural').text;
  await expect(output).toHaveText(natural);await expect(editor).toHaveValue(original);assert.ok(validateHumanized(original,natural));checks.push('instant preview preserves original and scientific content');
  await panel.getByText('Compare changes',{exact:true}).click();await expect(panel.locator('ins').first()).toBeVisible();await expect(panel.locator('del').first()).toBeVisible();checks.push('explicit before and after changes');
  await panel.getByRole('button',{name:'Copy draft',exact:true}).click();await expect(panel.getByRole('button',{name:'Copied draft',exact:true})).toBeVisible();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).replace(/\r\n/g,'\n'),natural);checks.push('clipboard export');
  const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Download draft',exact:true}).click();const file=await download;assert.equal(await readFile(await file.path(),'utf8'),natural);checks.push('text download matches preview');
  await panel.getByRole('radio',{name:/Concise academic/}).check();await expect(output).toHaveCount(0);
  await panel.getByRole('button',{name:'Humanize text',exact:true}).click();await expect(output).toHaveText(humanizeText(original,'concise').text);checks.push('style selection invalidates previous preview');
  await panel.getByRole('button',{name:'Apply humanized draft',exact:true}).click();await expect(editor).toHaveValue(humanizeText(original,'concise').text);await expect(output).toHaveCount(0);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(editor).toHaveValue(original);checks.push('apply and undo');
  await panel.getByRole('button',{name:'Humanize text',exact:true}).click();await editor.fill(original+' Additional verification is needed.');await expect(output).toHaveCount(0);checks.push('editing invalidates old preview');
  await editor.fill('We compared independent studies. Further research is needed.');await panel.getByRole('button',{name:'Humanize text',exact:true}).click();await expect(panel.getByRole('status')).toContainText('No matching phrases');checks.push('unchanged output explained');
  await editor.fill('');await expect(panel.getByRole('button',{name:'Humanize text',exact:true})).toBeDisabled();checks.push('empty input');
  await editor.fill('study '.repeat(1201));await expect(panel.getByRole('button',{name:'Humanize text',exact:true})).toBeDisabled();checks.push('oversized input');
  await editor.fill('study '.repeat(221));await panel.getByRole('button',{name:'Generate a draft',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('220 words');await expect(panel.getByRole('button',{name:'Humanize text',exact:true})).toBeEnabled();checks.push('model limit leaves instant pass available');
  await editor.fill(original);await panel.getByRole('button',{name:'Humanize text',exact:true}).click();
  for(const width of [375,768,1440]){
    await page.setViewportSize({width,height:1000});
    await expect(output).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
    const targets=await panel.locator('button,summary,label').evaluateAll(elements=>elements.filter(element=>element.getBoundingClientRect().width>0).map(element=>({name:element.textContent,height:element.getBoundingClientRect().height,width:element.getBoundingClientRect().width})));
    assert.ok(targets.every(target=>target.height>=44&&target.width>=44),JSON.stringify(targets));
    await editor.scrollIntoViewIfNeeded();await editor.evaluate(element=>element.scrollTop=0);await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});await page.screenshot({path:`artifacts/browser/humanize-${width}.png`,fullPage:true});
  }checks.push('375/768/1440 responsive layout and touch targets');
  await page.getByRole('tab',{name:'Humanize',exact:true}).focus();await page.keyboard.press('ArrowLeft');await expect(page.getByRole('tab',{name:/Revision review/})).toBeFocused();await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'Humanize',exact:true})).toBeFocused();checks.push('keyboard tabs');
  // Controlled worker replies exercise failure/race handling; rewrite-check.mjs runs the actual model.
  await page.evaluate(()=>{window.Worker=class{postMessage(value){window.pendingRewrite={worker:this,source:value.text};}terminate(){}};});
  const modelSource='The method utilizes 5 mg across 120 samples [1]. These results may improve interpretation without reducing uncertainty about individual findings.';
  await editor.fill(modelSource);await panel.getByRole('button',{name:'Generate a draft',exact:true}).click();
  await page.evaluate(()=>{const {worker,source}=window.pendingRewrite;worker.onmessage({data:{type:'result',text:source.replace('5 mg','5 kg'),changed:1}});});
  await expect(panel.getByRole('alert')).toContainText('was blocked');await expect(editor).toHaveValue(modelSource);await expect(output).toHaveCount(0);checks.push('unsafe worker draft rejected');
  await panel.getByRole('button',{name:'Generate a draft',exact:true}).click();await panel.getByRole('button',{name:'Cancel rewrite',exact:true}).click();
  await page.evaluate(()=>{const {worker,source}=window.pendingRewrite;worker.onmessage({data:{type:'result',text:source.replace('utilizes','uses'),changed:1}});});await expect(output).toHaveCount(0);await expect(editor).toHaveValue(modelSource);checks.push('cancelled worker reply discarded');
  await panel.getByRole('button',{name:'Generate a draft',exact:true}).click();await editor.fill(modelSource+' Independent replication is needed.');
  await page.evaluate(()=>{const {worker,source}=window.pendingRewrite;worker.onmessage({data:{type:'result',text:source.replace('utilizes','uses'),changed:1}});});await expect(output).toHaveCount(0);await expect(editor).toHaveValue(modelSource+' Independent replication is needed.');checks.push('source edits discard late worker reply');
  await editor.fill(modelSource);await panel.getByRole('button',{name:'Generate a draft',exact:true}).click();await page.evaluate(()=>window.pendingRewrite.worker.onerror({}));await expect(panel.getByRole('alert')).toContainText('could not start');await panel.getByRole('button',{name:'Humanize text',exact:true}).click();await expect(output).toHaveText(humanizeText(modelSource).text);checks.push('worker failure retains instant pass');
  assert.deepEqual(errors,[]);await writeFile('artifacts/browser/humanize.json',JSON.stringify({base,checks,errors},null,2));console.log(JSON.stringify({base,checks,errors}));
}finally{await browser.close();}
