import {chromium,expect} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('artifacts/browser',{recursive:true});
const browser=await chromium.launchPersistentContext('artifacts/browser/rewrite-profile',{channel:'chrome',headless:true,viewport:{width:1440,height:1000}});
try{
  const page=browser.pages()[0]??await browser.newPage();
  const failures=[];page.on('pageerror',error=>failures.push(error.message));
  await page.goto(process.env.APP_URL??'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.getByRole('tab',{name:/Revision review/}).click();
  await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).fill('We present a method for evaluating the stability of research findings across independent studies. The approach compares estimates from related experiments and identifies patterns that remain consistent when the data are divided into separate groups. We evaluate the method using simulated observations and publicly available research summaries. The results suggest that combining study-level estimates can improve interpretability while retaining uncertainty about individual findings. This work provides a practical framework for assessing reproducibility, but further validation is needed before applying it to decisions in clinical research.');
  const original=await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue();
  const started=Date.now();let status='';const attempts=[];
  for(let attempt=0;attempt<2;attempt++){
    await page.getByRole('button',{name:'Generate a draft',exact:true}).click();
    const attemptStarted=Date.now();
    while(Date.now()-attemptStarted<330000){
    const next=await page.locator('.model-progress').textContent().catch(()=>null);
    if(next&&next!==status){status=next;console.log(status);}
    if(await page.locator('.model-draft').count())break;
    if(await page.locator('.alert.error').count())break;
    await page.waitForTimeout(3000);
    }
    const attemptError=await page.locator('.alert.error').textContent().catch(()=>null);
    attempts.push({elapsed:Date.now()-attemptStarted,error:attemptError});
    if(!attemptError?.includes('took too long'))break;
  }
  const draft=await page.locator('.model-draft>p').textContent().catch(()=>null);
  const error=await page.locator('.alert.error').textContent().catch(()=>null);
  const unchanged=(await page.getByRole('textbox',{name:'Scientific abstract',exact:true}).inputValue())===original;
  await mkdir('artifacts/browser',{recursive:true});
  await writeFile('artifacts/browser/rewrite.json',JSON.stringify({draft,error,unchanged,failures,status,attempts,elapsed:Date.now()-started},null,2));
  await page.screenshot({path:'artifacts/browser/rewrite.png',fullPage:true});
  console.log(JSON.stringify({draftProduced:!!draft,error,originalUnchanged:unchanged,failures}));
  await expect(page.getByRole('textbox',{name:'Scientific abstract',exact:true})).toHaveValue(original);
  if(!draft)throw new Error(error??'The rewrite check did not produce a reviewed draft.');
}finally{await browser.close();}
