// Browser regression; requests are stubbed and no model API is called.
// npm install --prefix /tmp/coolauxv-browser-tests playwright
// NODE_PATH=/tmp/coolauxv-browser-tests/node_modules CHROMIUM_PATH=/usr/bin/chromium node tests/header-layout.browser.cjs
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {chromium}=require('playwright');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
  const files=process.argv.length>2?process.argv.slice(2):['coolauxv.user.js','chrome_ext/coolauxv.user.js'].map(file=>resolve(__dirname,'..',file));
  for(const file of files){
    const page=await browser.newPage({viewport:{width:1400,height:1000}});
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent('<html><body>Header reflow animation</body></html>');
    await page.evaluate(()=>{
      window.__store={coolauxv_default_provider:'plain',coolauxv_model_provider:'plain',coolauxv_enable_basic_anim:true,coolauxv_enable_minimize_anim:true,coolauxv_enable_blur_glass:false,coolauxv_legacy_provider_settings_migrated_v1:true,
        coolauxv_provider_templates_v1:[{id:'plain',label:'Plain',type:'chat-completions',baseUrl:'https://example.com/v1/chat/completions',reasoningEnabled:true,modelGroups:[{models:[{id:'reasoning',supportsReasoning:true}]}]}]};
      window.GM_getValue=(k,d)=>Object.hasOwn(__store,k)?__store[k]:d;
      window.GM_setValue=(k,v)=>{__store[k]=v;};
      window.GM_deleteValue=k=>delete __store[k];
      window.GM_listValues=()=>Object.keys(__store);
      window.GM_addStyle=css=>{const n=document.createElement('style');n.textContent=css;document.head.append(n);};
      window.GM_getResourceText=()=>'';
      window.GM_info={script:{version:'16.6.3'}};
      window.GM_xmlhttpRequest=()=>({abort(){}});
      window.marked={parse:x=>x};
    });
    const source=fs.readFileSync(file,'utf8').replace('    const startMain = () => {','    window.__reflow={syncHeaderLayoutAnimation};\n    const startMain = () => {');
    await page.addScriptTag({content:source});
    await page.waitForSelector('#coolauxv-translate-popup',{state:'attached'});
    await page.evaluate(()=>{
      const root=document.querySelector('#coolauxv-translate-popup');root.style.width='900px';root.style.display='flex';
      document.querySelector('#coolauxv-doc-origin-info').style.display='inline-flex';
    });
    await page.waitForTimeout(500);
    const sample=()=>page.evaluate(()=>{
      const header=document.querySelector('#coolauxv-header');
      return {height:header.getBoundingClientRect().height,input:document.querySelector('#coolauxv-input').getBoundingClientRect().top,
        buttons:document.querySelector('#coolauxv-main-action-buttons').getBoundingClientRect().top,
        windowButtons:document.querySelector('#coolauxv-header-window-controls').getBoundingClientRect().top,
        animations:header.getAnimations().length,duration:header.getAnimations()[0]?.effect.getTiming().duration,
        overflow:header.style.overflow,inlineHeight:header.style.height};
    });
    const setWidth=width=>page.evaluate(width=>document.querySelector('#coolauxv-translate-popup').style.width=width+'px',width);
    const wide=await sample();
    await setWidth(400);
    await page.waitForTimeout(40);
    const down=await sample();
    assert.equal(down.animations,1,'wrapping must animate header height');
    await page.waitForTimeout(350);
    const narrow=await sample();
    assert.ok(down.input>wide.input && down.input<narrow.input,'input must move gradually down');
    assert.ok(down.buttons>wide.buttons && down.buttons<narrow.buttons,'buttons must move gradually down');
    assert.equal(down.windowButtons,wide.windowButtons,'window buttons must stay at the top');
    assert.equal(narrow.animations,0);
    assert.equal(narrow.inlineHeight,'');
    assert.equal(narrow.overflow,'');
    await setWidth(900);
    await page.waitForTimeout(40);
    const up=await sample();
    assert.equal(up.animations,1);
    assert.ok(up.input>wide.input && up.input<narrow.input,'input must move gradually up');
    // Reverse direction while a height animation is still running.
    await setWidth(400);
    await page.waitForTimeout(40);
    assert.equal((await sample()).animations,1);
    await page.waitForTimeout(350);
    assert.equal((await sample()).height,narrow.height);
    // Reasoning controls can wrap the header while their own width animations run.
    await page.locator('#coolauxv-reasoning-enable').uncheck();
    let collapseAnimated=false;
    for(let i=0;i<16;i++){await page.waitForTimeout(25);collapseAnimated ||= (await sample()).animations>0;}
    assert.equal(collapseAnimated,true,'collapsing reasoning controls must animate body movement');
    await page.locator('#coolauxv-reasoning-enable').check();
    let expandAnimated=false;
    for(let i=0;i<16;i++){await page.waitForTimeout(25);expandAnimated ||= (await sample()).animations>0;}
    assert.equal(expandAnimated,true,'expanding reasoning controls must animate body movement');
    await page.waitForTimeout(350);
    // Advanced animation controls both activation and cancellation of the layout animation.
    await setWidth(900);
    await page.waitForTimeout(40);
    assert.equal((await sample()).animations,1);
    await page.evaluate(()=>{GM_setValue('coolauxv_enable_minimize_anim',false);__reflow.syncHeaderLayoutAnimation();});
    assert.equal((await sample()).animations,0,'turning advanced animation off must cancel an active animation');
    await setWidth(400);
    await page.waitForTimeout(40);
    assert.equal((await sample()).animations,0);
    assert.equal((await sample()).height,narrow.height);
    await page.evaluate(()=>{GM_setValue('coolauxv_enable_minimize_anim',true);GM_setValue('coolauxv_anim_speed',2.5);__reflow.syncHeaderLayoutAnimation();});
    await setWidth(900);
    await page.waitForTimeout(25);
    assert.equal((await sample()).duration,100,'layout animation must respect animation speed');
    await page.waitForTimeout(200);
    // Opening a hidden popup establishes a fresh baseline instead of sliding from a stale size.
    await page.evaluate(()=>document.querySelector('#coolauxv-translate-popup').style.display='none');
    await page.waitForTimeout(40);
    await page.evaluate(()=>{const e=document.querySelector('#coolauxv-translate-popup');e.style.width='400px';e.style.display='flex';});
    await page.waitForTimeout(40);
    assert.equal((await sample()).animations,0);
    assert.deepEqual(errors,[]);
    console.log(file+': PASS (wrap/un-wrap movement, reasoning controls, interrupted animations, advanced switch, speed, reopening)');
    await page.close();
  }
  await browser.close();
})().catch(err=>{console.error(err);process.exit(1);});
