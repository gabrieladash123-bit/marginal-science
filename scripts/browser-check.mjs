import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.env.APP_URL??'http://127.0.0.1:5173';
await mkdir('artifacts/browser',{recursive:true});
const browser=await chromium.launch({channel:process.env.CI?undefined:'chrome',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1060}});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'networkidle'});
  await expect(page.locator('.result-heading')).toBeVisible({timeout:30000});
  const original=await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue();
  await page.screenshot({path:'artifacts/browser/workspace-desktop.png',fullPage:true});
  await page.getByRole('tab',{name:/Revision review/}).click();
  await expect(page.locator('.edit-item').first()).toBeVisible();
  await page.getByRole('button',{name:/Apply \d+ selected edits/}).click();
  const revised=await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue();
  assert.notEqual(revised,original);assert.ok(revised.includes('240'));assert.ok(revised.includes('[1]'));assert.ok(revised.includes('90%'));
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue(),original);
  await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).fill('Too short.');
  await expect(page.getByRole('button',{name:'Analyze writing',exact:true})).toBeDisabled();
  await expect(page.locator('.result-heading')).toHaveCount(0);
  await page.getByRole('button',{name:/Try an example/}).click();
  await expect(page.locator('.result-heading')).toHaveCount(1,{timeout:30000});
  await page.getByRole('link',{name:'Model report',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Evidence before confidence.'})).toBeVisible();
  await expect(page.locator('.confusion-table td')).toHaveCount(9);
  await page.screenshot({path:'artifacts/browser/model-report.png',fullPage:true});
  await page.getByRole('link',{name:'System design',exact:true}).click();
  await expect(page.getByRole('heading',{name:'From corpus to considered edits.'})).toBeVisible();
  await page.getByRole('link',{name:'Workspace',exact:true}).click();
  for(const width of [768,375]){
    await page.setViewportSize({width,height:1000});
    await expect(page.locator('.result-heading')).toBeVisible({timeout:30000});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Horizontal overflow at ${width}`);
    await page.screenshot({path:`artifacts/browser/workspace-${width}.png`,fullPage:true});
  }
  const targets=await page.locator('button').evaluateAll(buttons=>buttons.filter(button=>button.getBoundingClientRect().width>0).map(button=>({label:button.getAttribute('aria-label')??button.textContent.trim(),width:Math.round(button.getBoundingClientRect().width),height:Math.round(button.getBoundingClientRect().height)})));
  assert.deepEqual(errors,[]);
  const result={base,errors,checks:['live inference','reviewed revisions','protected citations and quantities','undo','invalid-input state','stale-result invalidation','model report','system navigation','375/768/1440 responsive layout'],mobileTargets:targets};
  await writeFile('artifacts/browser/report.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}finally{await browser.close();}
