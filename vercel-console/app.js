const {useEffect,useMemo,useRef,useState}=React;
const html=htm.bind(React.createElement);

const PROVIDERS=[
  {id:'openai-gpt',api:'openai',family:'gpt',name:'OpenAI GPT',short:'GPT',hint:'GPT & reasoning',accent:'#69dac8',placeholder:'sk-proj-…'},
  {id:'openai-codex',api:'openai',family:'codex',name:'OpenAI Codex',short:'</>',hint:'Coding agents',accent:'#b7afff',placeholder:'sk-proj-…'},
  {id:'anthropic',api:'anthropic',name:'Claude',short:'CL',hint:'Anthropic',accent:'#efa66f',placeholder:'sk-ant-…'},
  {id:'gemini',api:'gemini',name:'Gemini',short:'G',hint:'Google AI',accent:'#72a7ff',placeholder:'AIza…'},
  {id:'nvidia',api:'nvidia',name:'NVIDIA NIM',short:'N',hint:'Open models',accent:'#93d537',placeholder:'nvapi-…'},
  {id:'groq',api:'groq',name:'Groq',short:'GR',hint:'Fast inference',accent:'#f7a354',placeholder:'gsk_…'},
  {id:'mistral',api:'mistral',name:'Mistral',short:'M',hint:'Frontier & open',accent:'#ffcf53',placeholder:'Paste Mistral key'},
  {id:'openrouter',api:'openrouter',name:'OpenRouter',short:'OR',hint:'Multi-provider',accent:'#d2a4ff',placeholder:'sk-or-…'},
  {id:'mock',api:'mock',name:'Offline demo',short:'∞',hint:'No key needed',accent:'#c7f65a',placeholder:'No key required'}
];
const BROWSERS=['chromium','firefox','webkit','mobile-chrome'];
const MAX_UPLOAD_BYTES=5_500_000;

function App(){
  const [providerId,setProviderId]=useState('openai-gpt');
  const [apiKey,setApiKey]=useState('');
  const [showKey,setShowKey]=useState(false);
  const [models,setModels]=useState([]);
  const [model,setModel]=useState('');
  const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme||'dark');
  const [verification,setVerification]=useState({state:'idle',message:'Enter a key to load account models'});
  const [verifiedCredential,setVerifiedCredential]=useState(null);
  const [files,setFiles]=useState([]);
  const [criteria,setCriteria]=useState('');
  const [dragging,setDragging]=useState(false);
  const [baseUrl,setBaseUrl]=useState('https://staging.example.test');
  const [environment,setEnvironment]=useState('staging');
  const [retrievalK,setRetrievalK]=useState(6);
  const [chunkSize,setChunkSize]=useState(1600);
  const [browsers,setBrowsers]=useState(['chromium']);
  const [approvalGate,setApprovalGate]=useState(true);
  const [temperature,setTemperature]=useState(.1);
  const [maxOutputTokens,setMaxOutputTokens]=useState(8192);
  const [busy,setBusy]=useState('');
  const [design,setDesign]=useState(null);
  const [automation,setAutomation]=useState(null);
  const [traceability,setTraceability]=useState(null);
  const [activeTab,setActiveTab]=useState('summary');
  const [logs,setLogs]=useState([{time:stamp(),message:'React workspace ready',tone:'ok'}]);
  const [toast,setToast]=useState(null);
  const fileInput=useRef(null);
  const resultsRef=useRef(null);
  const selected=useMemo(()=>PROVIDERS.find(item=>item.id===providerId),[providerId]);
  const verified=selected.api==='mock'||Boolean(verifiedCredential&&verifiedCredential.providerId===providerId&&verifiedCredential.key===apiKey&&models.length);

  useEffect(()=>{
    if(!toast)return;
    const timer=setTimeout(()=>setToast(null),4200);
    return()=>clearTimeout(timer);
  },[toast]);

  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('quality-forge-theme',theme)}catch{}
  },[theme]);

  function chooseProvider(id){
    setProviderId(id);setApiKey('');setShowKey(false);setDesign(null);setAutomation(null);setTraceability(null);
    const provider=PROVIDERS.find(item=>item.id===id);
    if(provider.api==='mock'){
      const offline=[{id:'offline-deterministic',name:'Offline deterministic engine',capabilities:['QA design','Automation']}];
      setModels(offline);setModel(offline[0].id);setVerifiedCredential({providerId:id,key:''});
      setVerification({state:'ok',message:'Offline engine ready — no key required'});
    }else{
      setModels([]);setModel('');setVerifiedCredential(null);
      setVerification({state:'idle',message:'Enter a key to load account models'});
    }
  }

  async function verifyKey(){
    if(selected.api==='mock')return;
    if(apiKey.trim().length<16){setVerification({state:'bad',message:'Enter a complete API key first'});return;}
    setVerification({state:'loading',message:`Checking ${selected.name} and discovering models…`});
    setModels([]);setModel('');setVerifiedCredential(null);
    try{
      const response=await fetch('/api/models',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:selected.api,family:selected.family||'',apiKey:apiKey.trim()})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Provider verification failed.');
      setModels(payload.models);setModel(payload.models[0].id);
      setVerifiedCredential({providerId,key:apiKey.trim()});
      setVerification({state:'ok',message:`Verified — ${payload.models.length} compatible model${payload.models.length===1?'':'s'} available`});
      addLog(`${selected.name} key verified; ${payload.models.length} models loaded`,'ok');
    }catch(error){
      setVerification({state:'bad',message:error.message});
      setToast({message:error.message,error:true});
      addLog(`${selected.name} verification failed`,'warn');
    }
  }

  function addFiles(incoming){
    const allowed=[...incoming].filter(file=>/\.(pdf|docx|txt|md|markdown|json|csv|png|jpe?g|webp)$/i.test(file.name));
    const next=[...files,...allowed].slice(0,12);
    const total=next.reduce((sum,file)=>sum+file.size,0);
    if(total>MAX_UPLOAD_BYTES){setToast({message:'Keep the combined upload below 5.5 MB for secure processing.',error:true});return;}
    setFiles(next);
  }

  function toggleBrowser(name){
    setBrowsers(current=>current.includes(name)?(current.length===1?current:current.filter(item=>item!==name)):[...current,name]);
  }

  function config(){
    return{provider:selected.api,model,baseUrl,environment,retrievalK:Number(retrievalK),chunkSize:Number(chunkSize),browsers,approvalGate,temperature:Number(temperature),maxOutputTokens:Number(maxOutputTokens)};
  }

  async function runDesign(){
    if(!verified){setToast({message:'Verify the provider key before generating.',error:true});return;}
    if(!model){setToast({message:'Select an accessible model.',error:true});return;}
    if(!criteria.trim()&&!files.length){setToast({message:'Add a requirement document or paste acceptance criteria.',error:true});return;}
    try{new URL(baseUrl);}catch{setToast({message:'Enter a valid test environment URL.',error:true});return;}
    setBusy('design');setDesign(null);setAutomation(null);setTraceability(null);setActiveTab('summary');
    addLog(`Starting QA design with ${selected.name} / ${model}`);
    try{
      const documents=await serializeDocuments(files,criteria);
      const response=await pipeline({phase:'design',apiKey:apiKey.trim(),config:config(),documents});
      setDesign(response.artifacts);
      addLog(`${response.artifacts.requirements.length} requirements and ${response.artifacts.test_cases.length} test cases validated`,'ok');
      setBusy('');
      requestAnimationFrame(()=>resultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));
      if(!approvalGate)await runAutomation(response.artifacts);
    }catch(error){setBusy('');setToast({message:error.message,error:true});addLog('QA design stopped: '+error.message,'warn');}
  }

  async function runAutomation(sourceDesign=design){
    if(!sourceDesign||busy==='automation')return;
    setBusy('automation');addLog('Approval recorded; generating Playwright and Gherkin');
    try{
      const response=await pipeline({phase:'automation',apiKey:apiKey.trim(),config:config(),design:sourceDesign});
      setAutomation(response.automation);setTraceability(response.traceability);setActiveTab('automation');
      addLog(`${response.automation.bundles.length} automation bundles generated with complete trace links`,'ok');
      setBusy('');setToast({message:'Automation package generated successfully.'});
    }catch(error){setBusy('');setToast({message:error.message,error:true});addLog('Automation generation stopped: '+error.message,'warn');}
  }

  function download(){
    const payload={generated_at:new Date().toISOString(),provider:selected.name,model,config:config(),design,automation,traceability};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`quality-forge-${Date.now()}.json`;link.click();URL.revokeObjectURL(link.href);
  }

  function addLog(message,tone=''){setLogs(current=>[...current.slice(-7),{time:stamp(),message,tone}]);}
  const stage=automation?4:design?3:2;

  return html`<div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">Q</span><span className="brand-copy"><strong>Quality Forge</strong><small>Agentic test studio</small></span></div>
      <div className="top-actions"><span className="secure-pill"><i></i> Keys stay ephemeral</span><button className="theme-toggle" type="button" onClick=${()=>setTheme(value=>value==='dark'?'light':'dark')} aria-label=${`Switch to ${theme==='dark'?'day':'night'} mode`}><span aria-hidden="true">${theme==='dark'?'☀':'☾'}</span>${theme==='dark'?'Day':'Night'}</button></div>
    </header>
    <main className="page">
      <section className="hero"><div><p className="eyebrow">Multi-model QA orchestration</p><h1>Build the test system your <em>requirements deserve.</em></h1><p className="hero-copy">Connect the AI provider your team already trusts. Quality Forge verifies your key, discovers the models available to that account, and carries every requirement through review to automation.</p></div><aside className="hero-status"><div className="hero-status-top"><strong>SYSTEM / ${busy?'WORKING':'READY'}</strong><span className="live-dot"><i></i> Private session</span></div><div className="security-list"><div className="security-row"><span>01</span>Credentials are never persisted</div><div className="security-row"><span>02</span>Models load from provider APIs</div><div className="security-row"><span>03</span>Generation follows an approval gate</div></div></aside></section>
      <nav className="stepper" aria-label="Workflow progress">${['Requirements','Intelligence','Review','Automation'].map((label,index)=>html`<div className=${`step ${stage===index+1?'active':''} ${stage>index+1?'done':''}`}><b>${stage>index+1?'✓':index+1}</b>${label}</div>`)}</nav>
      <section className="workspace">
        <article className="panel">
          <div className="panel-header"><div className="panel-heading"><span className="panel-number">01</span><div><h2>Requirement sources</h2><p>Documents, screenshots, and acceptance criteria</p></div></div><span className="field-note">${files.length}/12 files</span></div>
          <div className="panel-body">
            <div className=${`dropzone ${dragging?'dragging':''}`} onDragOver=${event=>{event.preventDefault();setDragging(true)}} onDragLeave=${()=>setDragging(false)} onDrop=${event=>{event.preventDefault();setDragging(false);addFiles(event.dataTransfer.files)}} onClick=${()=>fileInput.current?.click()} role="button" tabIndex="0" onKeyDown=${event=>{if(event.key==='Enter'||event.key===' ')fileInput.current?.click()}}>
              <div><div className="drop-icon">＋</div><strong>Drop evidence or <span className="text-button">browse files</span></strong><p>PDF, DOCX, TXT, Markdown, JSON, PNG, JPG, or WebP · 5.5 MB total</p></div>
            </div>
            <input ref=${fileInput} className="file-input" type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.json,.csv,.png,.jpg,.jpeg,.webp" onChange=${event=>{addFiles(event.target.files);event.target.value=''}}/>
            ${files.length>0&&html`<div className="file-list">${files.map((file,index)=>html`<span className="file-chip"><span>▤</span><strong>${file.name}</strong><small>${formatBytes(file.size)}</small><button type="button" aria-label=${`Remove ${file.name}`} onClick=${event=>{event.stopPropagation();setFiles(current=>current.filter((_,at)=>at!==index))}}>×</button></span>`)}</div>`}
            ${!['anthropic','gemini','mock'].includes(selected.api)&&html`<p className="action-note">${selected.name} uses text evidence in hosted mode. Choose Claude or Gemini for direct PDF and image analysis.</p>`}
            <div className="divider"></div>
            <div className="field"><div className="label-row"><label htmlFor="criteria">Acceptance criteria</label><span className="field-note">${criteria.length.toLocaleString()} chars</span></div><textarea id="criteria" value=${criteria} onInput=${event=>setCriteria(event.target.value)} placeholder="Paste user stories, business rules, or acceptance criteria…"></textarea></div>
          </div>
        </article>
        <article className="panel">
          <div className="panel-header"><div className="panel-heading"><span className="panel-number">02</span><div><h2>Choose your intelligence</h2><p>Verify a provider key to reveal accessible models</p></div></div><span className="field-note">9 providers</span></div>
          <div className="panel-body">
            <div className="provider-select-shell" style=${{'--accent':selected.accent}}><span className="provider-badge">${selected.short}</span><div className="field provider-select-copy"><div className="label-row"><label htmlFor="provider">Model provider</label><span className="field-note">8 cloud providers + offline</span></div><select id="provider" value=${providerId} onChange=${event=>chooseProvider(event.target.value)}>${PROVIDERS.map(item=>html`<option value=${item.id}>${item.name} — ${item.hint}</option>`)}</select><p>${selected.hint}. Select a provider, verify its key, then choose from the returned model catalog.</p></div></div>
            <div className="divider"></div>
            <div className="field"><div className="label-row"><label htmlFor="apiKey">${selected.api==='mock'?'Provider status':`${selected.name} API key`}</label><span className="field-note">Sent only for this request</span></div><div className="key-row"><div className="input-wrap"><input id="apiKey" className="control" type=${showKey?'text':'password'} autoComplete="off" spellCheck="false" value=${apiKey} onInput=${event=>{setApiKey(event.target.value);setModels([]);setModel('');setVerifiedCredential(null);setVerification({state:'idle',message:'Key changed — verify again to load models'})}} placeholder=${selected.placeholder} disabled=${selected.api==='mock'}/>${selected.api!=='mock'&&html`<button type="button" className="reveal" onClick=${()=>setShowKey(value=>!value)}>${showKey?'Hide':'Show'}</button>`}</div><button className="button" type="button" onClick=${verifyKey} disabled=${selected.api==='mock'||verification.state==='loading'}>${verification.state==='loading'?html`<span><i className="spinner"></i>Checking</span>`:'Verify & load models'}</button></div></div>
            <div className=${`verification ${verification.state==='ok'?'ok':verification.state==='bad'?'bad':''}`}><span><i></i>${verification.message}</span>${verification.state==='ok'&&html`<strong>SECURE</strong>`}</div>
            <div className=${`model-box ${verified?'ready':''}`}><div className="model-summary"><strong>Generation model</strong><span className="model-count">${verified?`${models.length} AVAILABLE`:'VERIFY KEY FIRST'}</span></div><div className="field"><label htmlFor="model">Model returned by ${selected.name}</label><select id="model" value=${model} onChange=${event=>setModel(event.target.value)} disabled=${!verified||!models.length}>${!verified&&html`<option value="">Verify the provider key to load models</option>`}${models.map(item=>html`<option value=${item.id}>${item.name} · ${item.id}</option>`)}</select></div>${verified&&html`<div className="model-meta"><span className="mini-tag">Key verified</span><span className="mini-tag">${selected.name}</span><span className="mini-tag">Live catalog</span></div>`}</div>
            <details className="advanced"><summary>Advanced execution settings</summary><div className="advanced-grid">
              <div className="field"><label htmlFor="baseUrl">Target URL</label><input id="baseUrl" className="control" type="url" value=${baseUrl} onInput=${event=>setBaseUrl(event.target.value)}/></div>
              <div className="field"><label htmlFor="environment">Environment</label><select id="environment" value=${environment} onChange=${event=>setEnvironment(event.target.value)}><option>local</option><option>development</option><option>staging</option><option>production</option></select></div>
              <div className="field"><label htmlFor="retrievalK">Retrieval top K</label><input id="retrievalK" className="control" type="number" min="2" max="12" value=${retrievalK} onInput=${event=>setRetrievalK(event.target.value)}/></div>
              <div className="field"><label htmlFor="chunkSize">Chunk target</label><input id="chunkSize" className="control" type="number" min="500" max="4000" step="100" value=${chunkSize} onInput=${event=>setChunkSize(event.target.value)}/></div>
              <div className="field"><label htmlFor="temperature">Temperature · ${temperature}</label><input id="temperature" className="control" type="range" min="0" max="1" step=".1" value=${temperature} onInput=${event=>setTemperature(event.target.value)}/></div>
              <div className="field"><label htmlFor="maxOutputTokens">Max output tokens</label><input id="maxOutputTokens" className="control" type="number" min="1024" max="32768" step="1024" value=${maxOutputTokens} onInput=${event=>setMaxOutputTokens(event.target.value)}/></div>
              <div className="field" style=${{gridColumn:'1/-1'}}><span className="field-label">Browser matrix</span><div className="check-grid">${BROWSERS.map(name=>html`<label className="check"><input type="checkbox" checked=${browsers.includes(name)} onChange=${()=>toggleBrowser(name)}/>${name}</label>`)}</div></div>
              <label className="check" style=${{gridColumn:'1/-1'}}><input type="checkbox" checked=${approvalGate} onChange=${event=>setApprovalGate(event.target.checked)}/>Require human approval before automation</label>
            </div></details>
            <div className="action-area"><button className="button primary wide" type="button" onClick=${runDesign} disabled=${Boolean(busy)||!verified}>${busy==='design'?html`<span><i className="spinner"></i>Designing coverage</span>`:'Generate QA design →'}</button><p className="action-note">Keys are held in React memory only, excluded from downloads, and never written to logs or storage.</p></div>
          </div>
        </article>
        <section className="panel results" ref=${resultsRef}>
          <div className="panel-header"><div className="panel-heading"><span className="panel-number">03</span><div><h2>Review & automation</h2><p>Validate the design before executable assets are created</p></div></div>${design&&html`<span className="field-note">${selected.name} · ${model}</span>`}</div>
          <${HardGate} design=${design} automation=${automation} enabled=${approvalGate} busy=${busy}/>
          ${!design?html`<div className="results-empty"><span>Evidence becomes execution.</span>Generated requirements, cases, trace links, and automation appear here.</div>`:html`<${Results} design=${design} automation=${automation} traceability=${traceability} activeTab=${activeTab} setActiveTab=${setActiveTab} busy=${busy} approve=${()=>runAutomation()} download=${download}/>`}
          <div className="log-panel">${logs.map(item=>html`<div className=${`log-row ${item.tone}`}><time>${item.time}</time><span>${item.message}</span></div>`)}</div>
        </section>
      </section>
    </main>
    <footer className="footer"><div className="footer-brand"><span className="brand-mark">Q</span><div><strong>Quality Forge</strong><small>Requirements → review → reliable automation</small></div></div><div className="footer-signature"><span>Designed & built by</span><strong>Nishikant</strong></div><span className="footer-mark">N / QF · 2026</span></footer>
    ${toast&&html`<div className=${`toast ${toast.error?'error':''}`} role="status">${toast.message}</div>`}
  </div>`;
}

function HardGate({design,automation,enabled,busy}){
  const state=!enabled?'bypassed':automation?'approved':design?'review':'waiting';
  const copy={waiting:['Waiting for design','Generate the QA design to begin human review.'],review:['Human review required','Inspect requirements, test cases, and traceability before approving automation.'],approved:['Gate approved','Reviewed test cases have passed into automation generation.'],bypassed:['Automatic passage enabled','Human approval is currently disabled in advanced settings.']}[state];
  return html`<div className=${`gate-banner ${state}`}><span className="gate-shield">HG</span><div className="gate-copy"><small>Human hard gate</small><strong>${busy==='automation'?'Generating approved automation…':copy[0]}</strong><p>${copy[1]}</p></div><span className="gate-state">${state==='review'?'ACTION REQUIRED':state.toUpperCase()}</span></div>`;
}

function Results({design,automation,traceability,activeTab,setActiveTab,busy,approve,download}){
  const traces=traceability||design.traceability||[];
  const covered=traces.filter(item=>item.coverage_status==='covered').length;
  const tabs=[['summary','Review'],['cases','Test cases'],['traceability','Traceability'],['automation','Automation'],['raw','Raw JSON']];
  return html`<div><div className="metrics">${[[design.requirements.length,'Requirements'],[design.scenarios.length,'Scenarios'],[design.test_cases.length,'Test cases'],[design.ambiguities?.length||0,'Ambiguities'],[`${covered}/${design.requirements.length}`,'Automated']].map(item=>html`<div className="metric"><strong>${item[0]}</strong><span>${item[1]}</span></div>`)}</div><div className="result-toolbar"><div className="tabs">${tabs.map(([id,label])=>html`<button className=${`tab ${activeTab===id?'active':''}`} type="button" onClick=${()=>setActiveTab(id)}>${label}</button>`)}</div><div className="result-actions">${!automation&&html`<button className="button primary" type="button" onClick=${approve} disabled=${busy==='automation'}>${busy==='automation'?'Generating…':'Approve & generate code'}</button>`}<button className="button ghost" type="button" onClick=${download}>Download JSON</button></div></div><div className="result-content"><${ResultContent} tab=${activeTab} design=${design} automation=${automation} traces=${traces}/></div></div>`;
}

function ResultContent({tab,design,automation,traces}){
  if(tab==='summary')return html`<div className="artifact-grid">${design.requirements.map(item=>html`<article className="artifact-card"><small>${item.id}</small><h3>${item.title}</h3><p>${item.statement}</p></article>`)}</div>`;
  if(tab==='cases')return html`<div className="table-wrap"><table><thead><tr><th>ID</th><th>Test case</th><th>Priority</th><th>Requirements</th><th>Steps</th></tr></thead><tbody>${design.test_cases.map(item=>html`<tr><td><strong>${item.id}</strong></td><td>${item.title}</td><td>${item.priority}</td><td>${item.requirement_ids.join(', ')}</td><td>${item.steps.length}</td></tr>`)}</tbody></table></div>`;
  if(tab==='traceability')return html`<div className="table-wrap"><table><thead><tr><th>Requirement</th><th>Scenarios</th><th>Cases</th><th>Scripts</th><th>Status</th></tr></thead><tbody>${traces.map(item=>html`<tr><td><strong>${item.requirement_id}</strong></td><td>${item.scenario_ids.join(', ')}</td><td>${item.test_case_ids.join(', ')}</td><td>${item.script_files?.join(', ')||'Awaiting approval'}</td><td><span className="status">${item.coverage_status}</span></td></tr>`)}</tbody></table></div>`;
  if(tab==='automation')return automation?html`<div className="artifact-grid">${automation.bundles.map(bundle=>html`<article className="artifact-card"><small>${bundle.case_id}</small><h3>${bundle.files.length} generated files</h3><p>${bundle.files.map(file=>file.path).join(' · ')}</p></article>`)}</div>`:html`<div className="results-empty"><span>Approval required.</span>Review the test design, then generate Playwright and Gherkin assets.</div>`;
  return html`<pre className="code">${JSON.stringify({design,automation,traceability:traces},null,2)}</pre>`;
}

async function pipeline(payload){
  const response=await fetch('/api/pipeline',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'The pipeline request failed.');
  return result;
}

async function serializeDocuments(files,criteria){
  const documents=[];
  for(const file of files){
    const textLike=file.type.startsWith('text/')||/\.(txt|md|markdown|json|csv)$/i.test(file.name);
    documents.push({name:file.name,mediaType:file.type||'application/octet-stream',encoding:textLike?'text':'base64',content:textLike?await file.text():await toBase64(file)});
  }
  if(criteria.trim())documents.push({name:'pasted-acceptance-criteria.md',mediaType:'text/markdown',encoding:'text',content:criteria.trim()});
  return documents;
}

function toBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error(`Could not read ${file.name}.`));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file)})}
function formatBytes(bytes){return bytes<1024?`${bytes} B`:bytes<1048576?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/1048576).toFixed(1)} MB`}
function stamp(){return new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App}/>`);
