import {chromium,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const failures=[];page.on('pageerror',error=>failures.push(error.message));
  await page.goto(process.env.APP_URL??'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.getByRole('tab',{name:/Revision review/}).click();
  const original=await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue();
  await page.getByRole('button',{name:'Generate a draft',exact:true}).click();
  const started=Date.now();let status='';
  while(Date.now()-started<300000){
    const next=await page.locator('.model-progress').textContent().catch(()=>null);
    if(next&&next!==status){status=next;console.log(status);}
    if(await page.locator('.model-draft').count())break;
    if(await page.locator('.alert.error').count())break;
    await page.waitForTimeout(3000);
  }
  const draft=await page.locator('.model-draft>p').textContent().catch(()=>null);
  const error=await page.locator('.alert.error').textContent().catch(()=>null);
  const unchanged=(await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue())===original;
  await mkdir('artifacts/browser',{recursive:true});
  await writeFile('artifacts/browser/rewrite.json',JSON.stringify({draft,error,unchanged,failures,status,elapsed:Date.now()-started},null,2));
  await page.screenshot({path:'artifacts/browser/rewrite.png',fullPage:true});
  console.log(JSON.stringify({draftProduced:!!draft,error,originalUnchanged:unchanged,failures}));
  await expect(page.getByRole('textbox',{name:'Scientific abstract',exact:true})).toHaveValue(original);
}finally{await browser.close();}
