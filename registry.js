
(() => {
"use strict";
const hosts = ["registras", "post-hoc"].map(id => document.getElementById(id).shadowRoot);
const byId = id => hosts[0].getElementById(id) ?? hosts[1].getElementById(id);
const ns = "http://www.w3.org/2000/svg";
let studyResults = null, resultsPromise = null;
async function inspectionJson(route) {
  if (!window.EEG_STUDY) throw Error("Trūksta atlaso duomenų failo.");
  return route === "results" ? window.EEG_STUDY.registry : window.EEG_STUDY.diagnostics;
}
const number = value => Number.isFinite(value) ? value.toFixed(3).replace('.', ',') : '—';
const count = value => Number.isFinite(value) ? value.toLocaleString('lt-LT') : '—';

function dateText(value) {
  if (!value) return 'nenurodytas';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'nenurodytas' : date.toLocaleString('lt-LT', {timeZone: 'Europe/Vilnius'});
}

function svgElement(parent, tag, attrs, text) {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

function options(id, rows, value) {
  const el=byId(id);
  el.replaceChildren(...rows.map(([key,label])=>{const option=document.createElement('option');option.value=String(key);option.textContent=label;return option;}));
  el.value=String(value);el.disabled=false;
}

const studyModels=['C0','M0a','M0a-w','M0b','M0a-L11','M0a-w-L11','M1','M1-TF','M1-TN','M1-P','M1-TFP','M2-A','M2-B','M2-TFA'];
const metricKeys=['mean_auc','balanced_accuracy','sensitivity','specificity','brier'];
const controlNames={parameter_randomization:'Parametrai · IG',label_randomization:'Etiketės · IG',parameter_randomization_occlusion:'Parametrai · occlusion',label_randomization_occlusion:'Etiketės · occlusion'};
const stageNames={primary:'Pagrindinis tyrimas',reliability:'Patikimumo atranka','loso-linear':'LOSO · tiesiniai',masked:'Kanalų maskavimas','label-control':'Etikečių kontrolė','density_0.10':'Tankis 0,10','density_0.15':'Tankis 0,15','density_0.20':'Tankis 0,20','density_0.30':'Tankis 0,30','density_0.40':'Tankis 0,40'};
const precise=value=>!Number.isFinite(value)?'—':value===0?'0':Math.abs(value)<.001||Math.abs(value)>=10000?value.toExponential(2).replace('.',','):value.toLocaleString('lt-LT',{maximumSignificantDigits:4});
const exactNumber=value=>Number.isFinite(value)?String(value).replace('.',','):'—';
const xaiTimingNames={ig_with_convergence:'IG su konvergencijos bandymais',occlusion:'Regionų okliuzija',parameter_control_ig_with_convergence:'Parametrų kontrolė · IG',parameter_control_occlusion:'Parametrų kontrolė · okliuzija',label_control_ig_with_convergence:'Etikečių kontrolė · IG',label_control_occlusion:'Etikečių kontrolė · okliuzija'};
const intervalText=value=>Array.isArray(value)?value.map(number).join(' – '):'—';
const gate=value=>value===true?'Praeitas':value===false?'Nepraeitas':'Nenurodyta';

function dataTable(target,caption,headers,rows){
  const host=typeof target==='string'?byId(target):target,wrap=document.createElement('div'),table=document.createElement('table');
  wrap.className='data-scroll';wrap.setAttribute('tabindex','0');wrap.setAttribute('role','region');wrap.setAttribute('aria-label',caption);
  const cap=document.createElement('caption');cap.textContent=caption;table.appendChild(cap);
  const head=document.createElement('thead'),tr=document.createElement('tr');
  headers.forEach(text=>{const cell=document.createElement('th');cell.setAttribute('scope','col');cell.textContent=text;tr.appendChild(cell);});head.appendChild(tr);table.appendChild(head);
  const body=document.createElement('tbody');rows.forEach(values=>{const row=document.createElement('tr');values.forEach((value,i)=>{const cell=document.createElement('td');cell.textContent=value==null?'—':String(value);if(i===0)cell.className='wrap';row.appendChild(cell);});body.appendChild(row);});table.appendChild(body);wrap.appendChild(table);host.replaceChildren(wrap);
}
function finiteTree(value,depth=0){
  if(depth>12)throw Error('Suvestinės struktūra per gili');
  if(typeof value==='number'&&!Number.isFinite(value))throw Error('Suvestinėje yra nebaigtinė reikšmė');
  if(Array.isArray(value))value.forEach(v=>finiteTree(v,depth+1));
  else if(value&&typeof value==='object')Object.values(value).forEach(v=>finiteTree(v,depth+1));
}
function validateResults(d){
  finiteTree(d);
  if(!d||!d.study||!Array.isArray(d.models)||!d.models.length||new Set(d.models).size!==d.models.length||!d.models.every(m=>studyModels.includes(m))
    ||!Array.isArray(d.primary)||!Array.isArray(d.stages)||!Array.isArray(d.all_valid)||!Array.isArray(d.comparisons)||!Array.isArray(d.permutations)
    ||!Array.isArray(d.benchmark)||!Array.isArray(d.benchmark_context)||!Array.isArray(d.xai_times)||!Array.isArray(d.times)||!d.xai_precision||!d.timing||typeof d.source_scope!=='string'
    ||!d.source_hashes||!Object.entries(d.source_hashes).every(([k,v])=>/^[a-z_]+\.json$/.test(k)&&/^[a-f0-9]{64}$/.test(v)))throw Error('Netinkama išsaugotų analizių schema');
  const numeric=v=>v===null||typeof v==='number'&&Number.isFinite(v),ci=v=>v===null||Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&v[0]<=v[1];
  const metrics=row=>row&&metricKeys.every(k=>numeric(row[k])&&(row[k]===null||row[k]>=0&&row[k]<=1))&&ci(row.ci95);
  if(d.study.model_count!==d.models.length||d.primary.length!==d.models.length||new Set(d.primary.map(r=>r.model)).size!==d.models.length
    ||!d.primary.every(r=>d.models.includes(r.model)&&metrics(r)&&(r.auc_by_repeat===null||Array.isArray(r.auc_by_repeat)&&r.auc_by_repeat.every(numeric))
      &&(r.calibration_curve===null||Array.isArray(r.calibration_curve?.prob_true)&&Array.isArray(r.calibration_curve?.prob_pred)&&r.calibration_curve.prob_true.length===r.calibration_curve.prob_pred.length&&[...r.calibration_curve.prob_true,...r.calibration_curve.prob_pred].every(v=>typeof v==='number'&&v>=0&&v<=1)))
    ||!d.stages.every(s=>Object.hasOwn(stageNames,s.key)&&s.models&&Object.entries(s.models).every(([m,r])=>d.models.includes(m)&&metrics(r)))
    ||!d.all_valid.every(r=>d.models.includes(r.model)&&['mean_auc','primary_auc','delta_auc'].every(k=>numeric(r[k]))&&ci(r.ci95)&&ci(r.delta_ci95))
    ||!d.comparisons.every(r=>d.models.includes(r.a)&&d.models.includes(r.b)&&numeric(r.delta_auc)&&ci(r.ci95))
    ||!d.permutations.every(r=>d.models.includes(r.model)&&['FULL_B_COMPLETE','NOT_SIGNIFICANT_BY_DETERMINISTIC_BOUND'].includes(r.status)&&['n_completed','B_max','exceedances','exact_p_value','p_for_Holm','p_holm','observed_auc'].every(k=>numeric(r[k]))&&ci(r.bounds)
      &&(r.status!=='NOT_SIGNIFICANT_BY_DETERMINISTIC_BOUND'||r.exact_p_value===null&&r.p_for_Holm===1))
    ||!d.benchmark.every(r=>d.models.includes(r.model)&&['full_ms','full_p95','full_n','prepared_ms','prepared_p95','prepared_n'].every(k=>numeric(r[k])))
    ||!d.times.every(r=>d.models.includes(r.model)&&Object.hasOwn(stageNames,r.stage)&&numeric(r.seconds)&&numeric(r.operations)))throw Error('Analizių metrikos arba modelių tapatybė nesutampa');
  const natural=v=>v===null||Number.isSafeInteger(v)&&v>=0,text=v=>v===null||typeof v==='string'&&v.length>0&&v.length<=500;
  if(d.benchmark_context.length!==2||new Set(d.benchmark_context.map(r=>r.profile)).size!==2
    ||!d.benchmark_context.every(r=>['full','prepared'].includes(r.profile)&&['methodology_profile','scope','excluded_scope','device'].every(k=>text(r[k]))
      &&['threads','warmup','measurements_per_subject_checkpoint'].every(k=>natural(r[k]))&&r.hardware&&['cpu_model','gpu','platform','torch'].every(k=>text(r.hardware[k])))
    ||!d.benchmark.every(r=>['full_measurements','full_pairs','prepared_measurements','prepared_pairs'].every(k=>natural(r[k])))
    ||!d.xai_times.every(r=>['historical','fp32'].includes(r.version)&&Object.hasOwn(xaiTimingNames,r.method)&&natural(r.reports)&&natural(r.operations)&&numeric(r.seconds)&&(r.seconds===null||r.seconds>=0)))throw Error('Netinkamos skaičiavimo sąnaudos arba matavimo sąlygos');
  if(d.xai_cohort!==undefined){const c=d.xai_cohort;if(!c||!Number.isInteger(c.n_bootstrap)||c.n_bootstrap<=0||!Number.isInteger(c.seed)||c.seed<0
    ||!Array.isArray(c.groups)||c.groups.length!==12||new Set(c.groups.map(r=>[r.model,r.method,r.group].join('/'))).size!==12
    ||!c.groups.every(r=>d.models.includes(r.model)&&['M1','M1-TF','M2-TFA'].includes(r.model)&&['ig','occlusion'].includes(r.method)&&['HC','MDD'].includes(r.group)
      &&Number.isInteger(r.n_subjects)&&r.n_subjects>0&&r.diagnostic_only===true&&r.uncertainty_status==='subject_bootstrap'))throw Error('Kohortos XAI suvestinių metaduomenys nesutampa');}
}
async function loadResults(){
  if(studyResults)return studyResults;if(resultsPromise)return resultsPromise;
  byId('results-state').textContent='Tikrinami užfiksuotų suvestinių failai…';
  resultsPromise=(async()=>{try{const d=await inspectionJson('results');validateResults(d);studyResults=d;renderResults();return d;}
    catch(error){byId('results-content').hidden=true;byId('results-state').textContent='Analizės neįkeltos. '+error.message;return null;}
    finally{resultsPromise=null;}})();return resultsPromise;
}
let xaiDiagnostics=null,diagnosticsRequest=0;
const diagnosticScoreNames={logit:'Klasės logitas',margin:'Logitų skirtumas',probability:'Klasės tikimybė'};
const diagnosticBaselineNames={native:'Modelio bazė',zero:'Nulinė bazė'};
const diagnosticPairNames={'logit-margin':'Logitas ↔ skirtumas','logit-probability':'Logitas ↔ tikimybė','margin-probability':'Skirtumas ↔ tikimybė'};
const diagnosticMetricNames={rho_median:'Spearmano ρ mediana',top10_jaccard_median:'Top 10 % Jaccard mediana',relative_l1_median:'Santykinio L1 pokyčio mediana',relative_l1_max:'Didžiausias santykinis L1 pokytis'};
function validateDiagnostics(d){
  finiteTree(d);
  if(d?.kind==='xai_posthoc'&&d.status==='MISSING')return;
  const numeric=v=>v===null||typeof v==='number'&&Number.isFinite(v),integer=v=>Number.isInteger(v)&&v>=0;
  if(!d||d.schema_version!==1||d.kind!=='xai_posthoc'||!['COMPLETE','PARTIAL','FAILED'].includes(d.status)
    ||!Array.isArray(d.models)||d.models.join(',')!=='M1,M1-TF,M2-TFA'||typeof d.created_at!=='string'
    ||!d.coverage||!['requested_subjects','completed_subjects','cohort_subjects','repeats','models','expected_subject_models','completed_subject_models'].every(k=>integer(d.coverage[k]))
    ||d.coverage.completed_subjects>d.coverage.requested_subjects||d.coverage.requested_subjects>d.coverage.cohort_subjects
    ||d.coverage.completed_subject_models>d.coverage.expected_subject_models||d.coverage.models!==d.models.length
    ||d.coverage.expected_subject_models!==d.coverage.requested_subjects*d.coverage.models
    ||d.status==='COMPLETE'&&(d.coverage.completed_subjects!==d.coverage.requested_subjects||d.coverage.completed_subject_models!==d.coverage.expected_subject_models)
    ||!d.protocol||d.protocol.selection!=='prespecified_manifest_indices_0_10_20_30_40'||!integer(d.protocol.comparison_steps)||!['native_steps','zero_steps'].every(k=>Array.isArray(d.protocol[k])&&d.protocol[k].every(integer))
    ||!['baseline_note','interpretation','selection'].every(k=>typeof d.protocol[k]==='string')
    ||!['limitations','errors'].every(k=>Array.isArray(d[k])&&d[k].every(v=>typeof v==='string')))throw Error('Netinkama post hoc diagnostikos schema');
  const fields={score_stability:['n_subjects','n_valid','median','q25','q75','min','max'],baseline_effect:['n','n_valid','rho_median','rho_min','top10_jaccard_median','relative_l1_median'],score_comparison:['n','n_valid','rho_median','top10_jaccard_median'],convergence:['from_steps','to_steps','n','n_valid','rho_median','rho_min','relative_l1_median','relative_l1_max','top10_jaccard_median','completeness_passed','completeness_total']};
  for(const [table,keys]of Object.entries(fields))if(!Array.isArray(d[table])||d[table].length>1000||!d[table].every(r=>r&&d.models.includes(r.model)&&keys.every(k=>numeric(r[k]))
    &&(table==='baseline_effect'||Object.hasOwn(diagnosticBaselineNames,r.baseline))&&(table==='score_comparison'?['logit-margin','logit-probability','margin-probability'].includes(r.pair):Object.hasOwn(diagnosticScoreNames,r.score))))throw Error('Netinkama diagnostikos lentelė');
  for(const row of d.convergence){
    if(!['per_view','subject'].includes(row.completeness_scope))throw Error('Netinkamas pilnumo patikros vienetas');
    for(const key of ['max_abs_residual','max_scaled_residual']){const v=row[key],keys=['min','q25','median','q75','max'];
      if(!v||!integer(v.n_valid)||!keys.every(k=>numeric(v[k])&&(v[k]===null||v[k]>=0)))throw Error('Netinkama pilnumo liekanų suvestinė');
      const ordered=keys.map(k=>v[k]).filter(x=>x!==null);
      if(ordered.some((x,i)=>i&&x<ordered[i-1])||v.n_valid===0&&ordered.length)throw Error('Netinkama pilnumo liekanų aprėptis arba kvantilių tvarka');
    }
  }
}
async function loadDiagnostics(){
  const request=++diagnosticsRequest;xaiDiagnostics=null;byId('diagnostics-content').hidden=true;
  byId('diagnostics-state').textContent='Tikrinama atskira post hoc suvestinė…';
  try{const d=await inspectionJson('xai-diagnostics');if(request!==diagnosticsRequest)return;validateDiagnostics(d);
    if(d.status==='MISSING'){byId('diagnostics-state').textContent='Post hoc diagnostikos suvestinė dar nepateikta. Trūkstami rezultatai nelaikomi nuliais ar sėkminga patikra.';return;}
    xaiDiagnostics=d;options('diagnostics-model',d.models.map(m=>[m,m]),d.models.includes(byId('diagnostics-model').value)?byId('diagnostics-model').value:d.models[0]);
    if(!Object.hasOwn(diagnosticScoreNames,byId('diagnostics-score').value))byId('diagnostics-score').value='logit';
    renderDiagnostics();
  }catch(error){if(request!==diagnosticsRequest)return;byId('diagnostics-state').textContent='Diagnostika neįkelta. '+error.message;}
}
function diagnosticRows(table){return xaiDiagnostics[table].filter(r=>r.model===byId('diagnostics-model').value&&(table==='score_comparison'||r.score===byId('diagnostics-score').value));}
function diagnosticCoverage(row){const n=row.n_subjects??row.n;return count(row.n_valid)+' / '+count(n);}
function diagnosticRowState(row){const n=row.n_subjects??row.n;return row.n_valid===null||n===null?'Aprėptis nenurodyta':row.n_valid===0?'Nėra galiojančių palyginimų':row.n_valid<n?'Dalis palyginimų negalioja':'Pateikti visi palyginimai';}
function diagnosticResidual(value){return precise(value.median)+' / '+precise(value.max)+'; n = '+count(value.n_valid);}
function diagnosticPlot(id,title,rows,metric,label){
  const host=byId(id);host.replaceChildren();
  if(!rows.length){const p=document.createElement('p');p.className='panel-note';p.textContent='Šiam pasirinkimui rezultatų nepateikta.';host.appendChild(p);return;}
  const values=rows.map(r=>r[metric]).filter(Number.isFinite),domain=metric.startsWith('rho')?[-1,1]:metric.includes('jaccard')?[0,1]:[0,Math.max(...values,0)||1];
  resultPlot(host,title,rows.map(r=>({label:label(r),value:r[metric]})),{domain,axis:diagnosticMetricNames[metric],note:'Tik post hoc diagnostika. Taškai – išmatuotos suvestinės; trūkstamas įvertis nevaizduojamas kaip nulis. Tikslios reikšmės ir galiojančių palyginimų skaičiai pateikti lentelėje.'});
}
function renderDiagnostics(){
  const d=xaiDiagnostics;if(!d)return;const c=d.coverage;
  byId('diagnostics-content').hidden=false;
  byId('diagnostics-state').textContent=({COMPLETE:'Diagnostikos skaičiavimai baigti',PARTIAL:'Diagnostika dalinė',FAILED:'Diagnostikos vykdymas nepavyko'})[d.status]+' · '+dateText(d.created_at)+'. Tai nėra stabilumo patikros rezultatas.';
  byId('diagnostics-coverage').textContent='Baigti tiriamieji: '+count(c.completed_subjects)+' / '+count(c.requested_subjects)+' atrinktų iš '+count(c.cohort_subjects)+'. Tiriamojo ir modelio vienetai: '+count(c.completed_subject_models)+' / '+count(c.expected_subject_models)+'. '+count(c.models)+' modeliai · '+count(c.repeats)+' OOF pakartojimai. Ribota atranka nėra visos kohortos pervertinimas.';
  byId('diagnostics-protocol').textContent='Iš anksto pasirinkti įrašų indeksai: 0, 10, 20, 30, 40. Palyginimai ties '+count(d.protocol.comparison_steps)+' žingsnių. Modelio bazės tinklas: '+d.protocol.native_steps.join(' → ')+'. Nulinės bazės tinklas: '+d.protocol.zero_steps.join(' → ')+'. '+d.protocol.baseline_note+' '+d.protocol.interpretation;
  const stability=diagnosticRows('score_stability'),score=diagnosticRows('score_comparison'),baseline=diagnosticRows('baseline_effect'),convergence=diagnosticRows('convergence');
  byId('diagnostics-stability-plot').replaceChildren();
  if(stability.length)resultPlot('diagnostics-stability-plot','Stabilumas tarp OOF pakartojimų',stability.map(r=>({label:diagnosticBaselineNames[r.baseline],value:r.median,low:r.q25,high:r.q75})),{domain:[-1,1],axis:'Pasirašytas Spearmano ρ',note:'Taškas – tiriamųjų medianų mediana; atkarpa – 25–75 procentiliai. Tai nėra pasikliautinieji intervalai ar naujas PASS kriterijus.'});
  else{const p=document.createElement('p');p.className='panel-note';p.textContent='Šiam pasirinkimui stabilumo rezultatų nepateikta.';byId('diagnostics-stability-plot').appendChild(p);}
  dataTable('diagnostics-stability-table','Tiriamųjų stabilumo suvestinė',['Bazinė įvestis','Skalė','Galioja / n','Min','Q25','Mediana','Q75','Max','Aprėpties būsena'],stability.map(r=>[diagnosticBaselineNames[r.baseline],diagnosticScoreNames[r.score],diagnosticCoverage(r),...['min','q25','median','q75','max'].map(k=>precise(r[k])),diagnosticRowState(r)]));
  diagnosticPlot('diagnostics-score-plot','Skalių porų žemėlapių sutapimas',score,'rho_median',r=>diagnosticBaselineNames[r.baseline]+' · '+diagnosticPairNames[r.pair]);
  dataTable('diagnostics-score-table','Visos skalių poros pasirinktame modelyje; šiai lentelei skalės filtras netaikomas',['Bazinė įvestis','Skalių pora','Galioja / n','ρ mediana','Top 10 % Jaccard','Aprėpties būsena'],score.map(r=>[diagnosticBaselineNames[r.baseline],diagnosticPairNames[r.pair],diagnosticCoverage(r),precise(r.rho_median),precise(r.top10_jaccard_median),diagnosticRowState(r)]));
  const bm=byId('diagnostics-baseline-metric').value||'rho_median',cm=byId('diagnostics-convergence-metric').value||'rho_median';
  diagnosticPlot('diagnostics-baseline-plot','Modelio ir nulinės bazės palyginimas',baseline,bm,r=>diagnosticScoreNames[r.score]);
  dataTable('diagnostics-baseline-table','Porinis bazinės įvesties poveikis prie to paties modelio',['Skalė','Galioja / n','ρ mediana','ρ min','Top 10 % Jaccard','Santykinis L1','Aprėpties būsena'],baseline.map(r=>[diagnosticScoreNames[r.score],diagnosticCoverage(r),...['rho_median','rho_min','top10_jaccard_median','relative_l1_median'].map(k=>precise(r[k])),diagnosticRowState(r)]));
  diagnosticPlot('diagnostics-convergence-plot','IG žingsnių palyginimas',convergence,cm,r=>diagnosticBaselineNames[r.baseline]+' · '+count(r.from_steps)+' → '+count(r.to_steps));
  dataTable('diagnostics-convergence-table','Konvergencija; pilnumas ir vykdymų didžiausių liekanų mediana / maksimumas',['Bazė','Žingsniai','Galioja / n','ρ mediana','ρ min','Santykinis L1 med.','Santykinis L1 max','Top 10 % Jaccard','Pilnumo vienetas','Pilnumas: praėjo / tikrinta','Absoliuti liekana: med. / max; n','Liekana / tolerancija: med. / max; n','Aprėpties būsena'],convergence.map(r=>[diagnosticBaselineNames[r.baseline],count(r.from_steps)+' → '+count(r.to_steps),diagnosticCoverage(r),...['rho_median','rho_min','relative_l1_median','relative_l1_max','top10_jaccard_median'].map(k=>precise(r[k])),r.completeness_scope==='subject'?'Tiriamasis':'Atskiras vaizdas',count(r.completeness_passed)+' / '+count(r.completeness_total),diagnosticResidual(r.max_abs_residual),diagnosticResidual(r.max_scaled_residual),diagnosticRowState(r)]));
  dataTable('diagnostics-notes','Užregistruoti ribotumai ir vykdymo klaidos',['Tipas','Pastaba'],[...d.limitations.map(v=>['Ribotumas',v]),...d.errors.map(v=>['Vykdymo klaida',v])]);
}
function supplementPicker(labelText,names){
  const label=document.createElement('label'),select=document.createElement('select'),box=document.createElement('div');
  label.textContent=labelText;label.style.maxWidth='340px';names.forEach((n,i)=>select.add(new Option(n,i)));label.appendChild(select);
  byId('supplement-results').append(label,box);return [select,box];
}
function supplementChart(chart,title){
  // One ROC curve at a time; the table under the chart lists every model's AUC.
  const [select,box]=supplementPicker('Rodomas modelis',chart.series.map(r=>r.name));
  const draw=()=>{const svg=document.createElementNS(ns,'svg'),r=chart.series[+select.value],p=v=>(40+v*250).toFixed(1),q=v=>(260-v*250).toFixed(1);
    svg.setAttribute('viewBox','0 0 310 300');svg.setAttribute('role','img');svg.style.cssText='width:100%;max-width:380px;height:auto;display:block';
    svg.setAttribute('aria-label',title+': '+r.name+'. Tikslios AUC reikšmės pateiktos lentelėje po grafiku.');
    const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(text)e.textContent=text;svg.appendChild(e);};
    add('rect',{x:40,y:10,width:250,height:250,fill:'none',stroke:'var(--control-border)'});
    add('line',{x1:40,y1:260,x2:290,y2:10,stroke:'var(--muted)','stroke-dasharray':'4 4'});
    add('polyline',{points:r.points.map(([x,y])=>p(x)+','+q(y)).join(' '),fill:'none',stroke:'var(--teal)','stroke-width':2});
    [0,.5,1].forEach(v=>{add('text',{x:p(v),y:276,'text-anchor':'middle','font-size':11,fill:'var(--muted)'},String(v).replace('.',','));add('text',{x:34,y:+q(v)+4,'text-anchor':'end','font-size':11,fill:'var(--muted)'},String(v).replace('.',','));});
    add('text',{x:165,y:294,'text-anchor':'middle','font-size':11,fill:'var(--ink)'},chart.x);
    add('text',{x:12,y:135,'text-anchor':'middle','font-size':11,fill:'var(--ink)',transform:'rotate(-90 12 135)'},chart.y);
    box.replaceChildren(svg);};
  select.addEventListener('change',draw);draw();
}
function supplementHeatmaps(data,title){
  const [select,box]=supplementPicker('Rodoma grupė',data.groups.map(g=>g.name));
  const [matrixSelect,valuesBox]=supplementPicker('Skaitinės matricos juosta',data.matrix_names);
  select.id='cohort-xai-group';matrixSelect.id='cohort-xai-matrix';valuesBox.id='cohort-xai-values';
  const values=()=>{const g=data.groups[Number(select.value)],m=Number(matrixSelect.value);
    dataTable(valuesBox,g.name+' · '+data.matrix_names[m]+' · visos regionų porų reikšmės; tik diagnostikai',['Regionas',...data.labels.map(xaiLabel)],g.maps[m].map((row,i)=>[xaiLabel(data.labels[i]),...row.map(exactNumber)]));};
  const draw=()=>{const g=data.groups[+select.value],limit=Math.max(...g.maps.flat(2).map(Math.abs))||1,css=getComputedStyle(hosts[0].host),
      hue=name=>css.getPropertyValue(name).trim(),grid=document.createElement('div'),n=data.labels.length,scale=document.createElement('p');
    grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:12px;margin:10px 0';
    g.maps.forEach((map,m)=>{const figure=document.createElement('figure'),canvas=document.createElement('canvas'),caption=document.createElement('figcaption'),c=canvas.getContext('2d');
      figure.style.margin='0';canvas.width=canvas.height=n;canvas.style.cssText='width:100%;aspect-ratio:1;image-rendering:pixelated;border:1px solid var(--control-border);display:block';
      canvas.setAttribute('role','img');canvas.setAttribute('aria-label',g.name+' · '+data.matrix_names[m]+'. Didžiausia reikšmė pateikta lentelėje.');
      map.forEach((row,i)=>row.forEach((v,j)=>{c.globalAlpha=Math.min(1,Math.abs(v)/limit);c.fillStyle=hue(v<0?'--amber':'--teal');c.fillRect(j,i,1,1);}));
      caption.textContent=data.matrix_names[m];caption.style.cssText='font-size:12px;color:var(--muted);margin-top:4px';figure.append(canvas,caption);grid.appendChild(figure);});
    scale.className='panel-note';scale.textContent='Bendra grupės skalė ±'+precise(limit)+' · žalsva teigiama, gintarinė neigiama · regionai: '+data.labels.join(', ')+'.';
    box.replaceChildren(grid,scale);values();};
  matrixSelect.addEventListener('change',values);select.addEventListener('change',draw);draw();
}
function resultFigure(target,title,note){
  const host=typeof target==='string'?byId(target):target,figure=document.createElement('figure'),caption=document.createElement('figcaption'),scroll=document.createElement('div'),svg=document.createElementNS(ns,'svg'),description=document.createElement('p');
  figure.className='result-figure';caption.textContent=title;scroll.className='result-plot';scroll.setAttribute('tabindex','0');scroll.setAttribute('role','region');scroll.setAttribute('aria-label',title+' · slenkamas grafikas');
  svg.setAttribute('role','img');svg.setAttribute('aria-label',title+'. '+note);description.className='panel-note';description.textContent=note;
  scroll.appendChild(svg);figure.appendChild(caption);figure.appendChild(scroll);figure.appendChild(description);host.appendChild(figure);return svg;
}
function resultPlot(target,title,rows,{domain=[0,1],reference=null,note='Tikslios reikšmės pateiktos lentelėje.',axis=''}={}){
  const svg=resultFigure(target,title,note),height=rows.length*28+75,left=245,width=410,x=v=>left+(v-domain[0])/(domain[1]-domain[0])*width;
  svg.setAttribute('viewBox','0 0 820 '+height);
  for(let i=0;i<=4;i++){const v=domain[0]+(domain[1]-domain[0])*i/4;svgElement(svg,'line',{x1:x(v),x2:x(v),y1:12,y2:height-48,stroke:'var(--line)'});svgElement(svg,'text',{x:x(v),y:height-28,'text-anchor':'middle',fill:'var(--muted)','font-size':13},precise(v));}
  if(Number.isFinite(reference))svgElement(svg,'line',{x1:x(reference),x2:x(reference),y1:12,y2:height-48,stroke:'var(--ink)','stroke-dasharray':'5 4'});
  rows.forEach((r,i)=>{const y=28+i*28,color=r.label==='C0'?'var(--control)':'var(--teal)',valid=Number.isFinite(r.value),range=Number.isFinite(r.low)&&Number.isFinite(r.high);
    const label=svgElement(svg,'text',{x:left-12,y:y+5,'text-anchor':'end',fill:'var(--ink)','font-size':14},r.label.length>29?r.label.slice(0,27)+'…':r.label);svgElement(label,'title',{},r.label);
    if(range)svgElement(svg,'line',{x1:x(r.low),x2:x(r.high),y1:y,y2:y,stroke:color,'stroke-width':3});
    if(valid)svgElement(svg,'circle',{cx:x(r.value),cy:y,r:4,fill:color});
    svgElement(svg,'text',{x:left+width+15,y:y+5,fill:'var(--ink)','font-size':13},valid?precise(r.value):range?'Tik ribos':r.status==='NOT_ESTIMABLE'?'Neįvertinama':'Nėra įverčio');
  });
  svgElement(svg,'text',{x:left+width/2,y:height-6,'text-anchor':'middle',fill:'var(--ink)','font-size':13},axis);return svg;
}
function orderedStages(stages){return Object.keys(stageNames).filter(key=>stages.some(s=>s.key===key)).map(key=>stages.find(s=>s.key===key));}
function stageVisuals(d){
  byId('sensitivity-overview').replaceChildren();byId('density-visual').replaceChildren();
  const stages=orderedStages(d.stages);
  const codes={primary:'P',reliability:'R','loso-linear':'L',masked:'M','label-control':'E'},svg=resultFigure('sensitivity-overview','Visų etapų AUC matrica','P – pagrindinis; R – patikimumo atranka; L – LOSO; M – kanalų maskavimas; E – etikečių kontrolė; D – grafų tankis. NĮ – neįvertinama; — – modelis etape neskaičiuotas. Spalva rodo atstumą nuo 0,5, ne reikšmingumą.');
  svg.setAttribute('viewBox','0 0 900 '+(d.models.length*30+65));
  stages.forEach((s,j)=>svgElement(svg,'text',{x:124+j*76,y:24,'text-anchor':'middle',fill:'var(--ink)','font-size':13},codes[s.key]||'D'+Math.round(Number(s.key.slice(8))*100)));
  d.models.forEach((model,i)=>{const y=40+i*30;svgElement(svg,'text',{x:78,y:y+18,'text-anchor':'end',fill:'var(--ink)','font-size':14},model);
    stages.forEach((s,j)=>{const m=s.models[model],v=m?.status==='NOT_ESTIMABLE'?null:m?.mean_auc,x=90+j*76,valid=Number.isFinite(v);
      svgElement(svg,'rect',{x,y,width:68,height:26,rx:3,fill:valid?(v>=.5?'var(--teal)':'var(--amber)'):'var(--line)','fill-opacity':valid?.08+Math.abs(v-.5)*.5:.25});
      svgElement(svg,'text',{x:x+34,y:y+18,'text-anchor':'middle',fill:'var(--ink)','font-size':13},valid?number(v):m?.status==='NOT_ESTIMABLE'?'NĮ':'—');
    });
  });
  const density=stages.filter(s=>s.key.startsWith('density_')).sort((a,b)=>Number(a.key.slice(8))-Number(b.key.slice(8)));
  if(!density.length)return;
  const plot=resultFigure('density-visual','Penki grafų tankiai · AUC jautrumas','Tik M0a ir M0a-L11. Linijos jungia išsaugotus taškus; jos nėra naujas modelis ar interpoliuotas rezultatas. 95 % intervalai – atitinkamų etapų lentelėse ir grafikuose.');plot.setAttribute('viewBox','0 0 820 310');
  const px=v=>80+(v-.1)/.3*620,py=v=>250-v*200;
  for(const v of [0,.25,.5,.75,1]){svgElement(plot,'line',{x1:80,x2:700,y1:py(v),y2:py(v),stroke:v===.5?'var(--ink)':'var(--line)','stroke-dasharray':v===.5?'5 4':'none'});svgElement(plot,'text',{x:65,y:py(v)+4,'text-anchor':'end',fill:'var(--ink)','font-size':13},String(v));}
  density.forEach(s=>svgElement(plot,'text',{x:px(Number(s.key.slice(8))),y:275,'text-anchor':'middle',fill:'var(--ink)','font-size':13},s.key.slice(8)));
  ['M0a','M0a-L11'].forEach((model,index)=>{const color=index?'var(--amber)':'var(--teal)';let previous=null;
    density.forEach(s=>{const m=s.models[model],v=m?.mean_auc;if(!Number.isFinite(v)||m.status==='NOT_ESTIMABLE'){previous=null;return;}const point=[px(Number(s.key.slice(8))),py(v)];
      if(previous)svgElement(plot,'line',{x1:previous[0],y1:previous[1],x2:point[0],y2:point[1],stroke:color,'stroke-width':2,'stroke-dasharray':index?'5 3':'none'});
      svgElement(plot,'circle',{cx:point[0],cy:point[1],r:index?5:3,fill:color});previous=point;
    });svgElement(plot,'text',{x:100+index*170,y:22,fill:color,'font-size':14},model+(index?' · brūkšninė':' · vientisa'));
  });svgElement(plot,'text',{x:390,y:301,'text-anchor':'middle',fill:'var(--ink)','font-size':14},'Grafų tankis');
}
function supplementNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string')return null;
  const text=value.replace(/[ \u00a0\u202f]/g,'').replace(',','.');
  return /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text)&&Number.isFinite(Number(text))?Number(text):null;
}
function supplementNumericChart(section){
  const columns=section.headers.map((_,i)=>i).filter(i=>i>0&&section.rows.some(r=>supplementNumber(r[i])!==null));
  if(!columns.length)return;
  const label=document.createElement('label'),select=document.createElement('select'),box=document.createElement('div');label.className='result-metric';label.textContent='Rodomas rodiklis';
  columns.forEach(i=>{const option=document.createElement('option');option.value=String(i);option.textContent=section.headers[i];select.appendChild(option);});select.value=String(columns[0]);label.appendChild(select);byId('supplement-results').appendChild(label);byId('supplement-results').appendChild(box);
  const draw=()=>{const column=Number(select.value),rows=section.rows.map(r=>({label:String(r[0]).startsWith('H')?r[1]:r[0],value:supplementNumber(r[column])})),values=rows.map(r=>r.value).filter(Number.isFinite),lo=Math.min(0,...values),hi=Math.max(0,...values);
    box.replaceChildren();resultPlot(box,section.title+' · '+section.headers[column],rows,{domain:[lo,hi===lo?lo+1:hi],axis:section.headers[column],note:'Aprašomosios, lentelėje suapvalintos reikšmės. Intervalai, santykiai ir tekstas nekeičiami į taškinius įverčius; jų pilna forma lieka lentelėje. Skirtingų vienetų rodikliai rodomi atskirai.'});};
  select.addEventListener('change',draw);draw();
}
function renderRegistryPlots(d){
  byId('primary-visual').replaceChildren();resultPlot('primary-visual','Pirminis OOF AUC ir 95 % intervalai',d.primary.map(m=>({label:m.model,value:m.mean_auc,low:m.ci95?.[0],high:m.ci95?.[1]})),{reference:.5,axis:'AUC',note:'Atkarpos – išsaugoti 95 % subjektų bootstrap intervalai; 0,5 – atsitiktinio rangavimo atskaita.'});
  dataTable('primary-results','Pagrindinis tyrimas · visi modeliai',['Modelis','AUC','95 % intervalas','Subal. tikslumas','Jautrumas','Specifiškumas','Brier'],d.primary.map(m=>[m.model,number(m.mean_auc),intervalText(m.ci95),...metricKeys.slice(1).map(k=>number(m[k]))]));
  stageVisuals(d);
  resultPlot('all-valid-results','Visos tinkamos epochos − fiksuotos grupės',d.all_valid.map(r=>({label:r.model,value:r.delta_auc,low:r.delta_ci95?.[0],high:r.delta_ci95?.[1]})),{domain:[-1,1],reference:0,axis:'Suporuotas ΔAUC ir 95 % intervalas',note:'Tas pats išsaugotas modelis; naujo mokymo nėra. Nulis – skirtumo atskaita.'});
  resultPlot('comparison-results','Registruoti poriniai kontrastai',d.comparisons.map(r=>({label:r.name,value:r.delta_auc,low:r.ci95?.[0],high:r.ci95?.[1]})),{domain:[-1,1],reference:0,axis:'ΔAUC (A − B)',note:'Atkarpos – porinio skirtumo 95 % intervalai, ne atskirų modelių intervalai. Tai nėra p reikšmės.'});
  resultPlot('permutation-results','Permutacijų p: tikslus įvertis arba baigtinio B ribos',d.permutations.map(r=>({label:r.model,value:r.exact_p_value,low:r.bounds?.[0],high:r.bounds?.[1]})),{reference:.05,axis:'Nekoreguotas asociacijos p',note:'Sustabdytoms procedūroms taško nėra: tik deterministinės p ribos. Tai ne 95 % intervalai. Holm korekcija ir faktinis B pateikti lentelėje.'});
  const xai=Object.entries(d.xai_precision.new||{});
  resultPlot('precision-results','XAI stabilumas · tiriamųjų medianų min–mediana–max',xai.flatMap(([model,m])=>['ig','occlusion'].map(method=>({label:model+' · '+method,value:m[method+'_median_rho_range']?.median,low:m[method+'_median_rho_range']?.min,high:m[method+'_median_rho_range']?.max}))),{domain:[-1,1],reference:.4,axis:'Pasirašytas Spearmano ρ',note:'Atkarpos yra tiriamųjų medianų min–max, ne pasikliautinieji intervalai ir ne visas koreliacijų pasiskirstymas. Brūkšninė riba 0,4 – projekto stabilumo kriterijus.'});
  resultPlot('precision-technical','XAI kontrolę praėję tiriamieji',xai.flatMap(([model,m])=>Object.keys(controlNames).map((key,i)=>({label:model+' · '+['Param. IG','Etik. IG','Param. occ.','Etik. occ.'][i],value:m.controls_pass_subjects?.[key]}))),{domain:[0,d.study.subjects],axis:'Tiriamųjų skaičius',note:'Atskira kontrolė nesuteikia interpretavimo teisės, kai stabilumas nepraeitas.'});
  if(d.xai_cohort)resultPlot('xai-cohort-results','Kohortos XAI aprėptis',d.xai_cohort.groups.map(r=>({label:r.model+' · '+r.method+' · '+r.group,value:r.n_subjects})),{domain:[0,d.study.subjects],axis:'Tiriamųjų skaičius',note:'Aprėptis nėra XAI patikimumas. Visi žemėlapiai lieka diagnostiniai.'});
  for(const [key,title] of [['full_ms','Visa prognozės grandinė'],['prepared_ms','Jau parengta reprezentacija']]){
    const rows=d.benchmark.map(r=>({label:r.model,value:r[key]}));resultPlot('benchmark-results',title,rows,{domain:[0,Math.max(1,...rows.map(r=>r.value).filter(Number.isFinite))],axis:'Mediana, ms / tiriamasis',note:'Atskiri matavimo profiliai ir skalės. p95 bei n pateikti lentelėje; parengta reprezentacija nėra pilna grandinė.'});
  }
  const timeRows=d.times.map(r=>({label:(stageNames[r.stage]||r.stage)+' · '+r.model,value:r.seconds}));
  resultPlot('time-results','Išsaugotos etapų ir modelių trukmės',timeRows,{domain:[0,Math.max(1,...timeRows.map(r=>r.value).filter(Number.isFinite))],axis:'Sekundės',note:'Rodomi atskirai užregistruoti laikai. Jų suma nėra viso tyrimo sieninio laiko ar nepertraukiamo GPU naudojimo matavimas.'});
  dataTable('limitations-results','Ribos pagal Word planą, protokolą ir išsaugotus artefaktus',['Sritis','Kas riboja išvadą'],[
    ['Baigtis','MODMA MDD/HC ≠ gydymo atsakas. S-A neatliktas; temos ir metodinės dalies atitiktis derinama su vadovu. Klinikinė validacija nepriklauso šio metodinio magistro darbo priėmimui.'],
    ['Imtis','51 tiriamasis: 24 MDD, 27 HC. CV ir epochų grupės nedidina nepriklausomos imties. Maža imtis ir demografiniai skirtumai.'],
    ['QC ir ICA','Automatinė ICLabel ≥0,90 atranka skiriasi nuo plane numatytos rankinės komponentų peržiūros. 2026-11-11 autoriaus kohortos patvirtinimas nėra atskirų komponentų anotacijos.'],
    ['Apdorojimas','1–45 Hz skiriasi nuo ICLabel 1–100 Hz prielaidų; interpoliacija veikia junglumą. 15 epochų įverčiai kinta; elektrodai pagal standartinį, ne individualų šabloną.'],
    ['Vertinimas','Atranka ir scaler tik mokymo dalyje. Slenkstis parinktas mokymo prognozėse; bootstrap neapima naujo modelių mokymo. LOSO tik 6 tiesiniams modeliams.'],
    ['Modelių palyginimas','Graph6 ir L11 skiriasi ir grafų sudarymo konvencijomis, ne vien požymių skaičiumi. Top-k + MST gali viršyti tikslinį tankį. M1-TN nėra pilna Brain Network Transformer reprodukcija.'],
    ['Permutacijos','Tik C0 pilnas B=200; aštuoni sustabdyti modeliai neturi tikslaus p ar pilno nulinio pasiskirstymo. Etikečių kontrolė – atskira viena permaišymo realizacija.'],
    ['XAI','IG ir okliuzijos stabilumas 0/51 visiems 3 modeliams. Pilnumas, randomizacijos ir stabilumas – skirtingi vartai. 0,4 ir 0,2 yra projekto, ne universalios ribos.'],
    ['Plano XAI apimtis','Pagrindinis baseline – mokymo vidurkis; pilnos kohortos zero-baseline jautrumas šiame registre neįrodytas. Grad-CAM tik papildomas M1 vaizdas, ne transformerio paaiškinimas.'],
    ['Erdvinė interpretacija','Sensorių / galvos paviršiaus regionai nėra žievės šaltiniai. Kohortos vidurkinimas nepašalina nestabilumo; papildymo regionų vidurkiai neturi bootstrap intervalų.'],
    ['Papildymai','Post hoc ir aprašomieji. Demografinis vieno kintamojo AUC be CV. kNN / tapatybės agregatai suapvalinti. Parametrų skaičius iš kodo; asociacija neįrodo priežasties.'],
    ['Sąnaudos','Pilna grandinė prasideda nuo paruoštų matricų, ne nuo EEG. n=10 pilnų kvietimų p95 nėra patikimas populiacijos uodegos įvertis. Viso tyrimo compute laikas nežinomas.']]);
}
function renderResults(){
  const d=studyResults;if(!d)return;
  byId('results-content').hidden=false;
  byId('results-state').textContent=count(d.study.subjects)+' įrašas · '+count(d.study.repeats)+' × '+count(d.study.folds)+' CV · '+d.models.length+' modelių · skaičiavimų patikra '+dateText(d.study.completed_at)+'. '+d.study.xai_warning;
  options('analysis-model',d.models.map(m=>[m,m]),d.models.includes('M2-TFA')?'M2-TFA':d.models[0]);renderCalibration();
  byId('sensitivity-results').replaceChildren();
  orderedStages(d.stages).forEach(s=>{const detail=document.createElement('details'),summary=document.createElement('summary'),host=document.createElement('div');detail.className='analysis-detail';summary.textContent=(stageNames[s.key]||s.label)+' · '+Object.keys(s.models).length+' modelių';detail.appendChild(summary);detail.appendChild(host);dataTable(host,stageNames[s.key]||s.label,['Modelis','AUC','95 % intervalas','Subal. tikslumas','Jautrumas','Specifiškumas','Brier','Būsena'],Object.entries(s.models).map(([model,m])=>[model,number(m.mean_auc),intervalText(m.ci95),...metricKeys.slice(1).map(k=>number(m[k])),m.status==='NOT_ESTIMABLE'?'Neįvertinama':m.status?'Išsaugota':'—']));resultPlot(host,(stageNames[s.key]||s.label)+' · AUC',Object.entries(s.models).map(([model,m])=>({label:model,value:m.status==='NOT_ESTIMABLE'?null:m.mean_auc,low:m.status==='NOT_ESTIMABLE'?null:m.ci95?.[0],high:m.status==='NOT_ESTIMABLE'?null:m.ci95?.[1],status:m.status})),{reference:.5,axis:'AUC',note:'Tik šio etapo išsaugoti įverčiai ir 95 % intervalai. Neįvertinami atvejai paliekami be taško.'});byId('sensitivity-results').appendChild(detail);});
  dataTable('all-valid-results','Viena visų tinkamų duomenų įvestis ir fiksuotų grupių pirminė analizė',['Modelis','Visi tinkami · AUC','95 % intervalas','Pirminė · AUC','Pirminės 95 % intervalas','ΔAUC','Δ 95 % intervalas'],d.all_valid.map(r=>[r.model,number(r.mean_auc),intervalText(r.ci95),number(r.primary_auc),intervalText(r.primary_ci95),number(r.delta_auc),intervalText(r.delta_ci95)]));
  dataTable('comparison-results','Poriniai skirtumai iš išsaugotos pirminės suvestinės',['Palyginimas','A','B','ΔAUC (A − B)','Δ 95 % intervalas'],d.comparisons.map(r=>[r.name,r.a,r.b,number(r.delta_auc),intervalText(r.ci95)]));
  byId('permutation-scope').textContent=d.permutation_scope;
  dataTable('permutation-results','Sustabdytoms procedūroms tikslus p nenurodytas, o Holm naudoja konservatyvų 1',['Modelis','Procedūra','Stebėtas AUC','B / Bmax','Viršijimai','Pilno B p ribos','Tikslus p','p Holm įvesčiai','p Holm'],d.permutations.map(r=>[r.model,r.status==='FULL_B_COMPLETE'?'Visos B permutacijos':'Baigta pagal deterministinę ribą',number(r.observed_auc),count(r.n_completed)+' / '+count(r.B_max),count(r.exceedances),r.bounds?r.bounds.map(precise).join(' – '):'—',precise(r.exact_p_value),precise(r.p_for_Holm),precise(r.p_holm)]));
  const precisionRows=[];for(const kind of ['new'])for(const [model,m]of Object.entries(d.xai_precision[kind]||{}))precisionRows.push([kind==='new'?'FP32':'Ankstesnė',model,count(m.ig_stability_pass)+' / '+count(m.subjects),count(m.occlusion_stability_pass)+' / '+count(m.subjects),count(m.ig_completeness_pass_subjects)+' / '+count(m.subjects),count(m.ig_failed_repeat_units)+' / '+count(m.ig_total_repeat_units),['min','median','max'].map(k=>precise(m.ig_median_rho_range?.[k])).join(' / '),['min','median','max'].map(k=>precise(m.occlusion_median_rho_range?.[k])).join(' / '),count(d.xai_precision.interpretation_eligible?.[model]?.ig)+' / '+count(d.xai_precision.interpretation_eligible?.[model]?.occlusion)]);
  dataTable('precision-results','Stabilumas ir pilnumas; paskutinis stulpelis – tik FP32 interpretavimo vartai',['Versija','Modelis','IG stabilūs','Occlusion stabilūs','IG pilnumas','IG nepraėję pakartojimai','IG ρ min / med. / max','Occlusion ρ min / med. / max','FP32 tinkami IG / occ.'],precisionRows);
  const technical=[];for(const kind of ['new'])for(const [model,m]of Object.entries(d.xai_precision[kind]||{}))technical.push([kind==='new'?'FP32':'Ankstesnė',model,count(m.constant_ig_maps)+' / '+count(m.constant_occlusion_maps),['64','128','256'].map(k=>count(m.steps_histogram?.[k])).join(' / '),...Object.keys(controlNames).map(k=>count(m.controls_pass_subjects?.[k])),['min','median','max'].map(k=>precise(m.failed_ratio_range?.[k])).join(' / ')]);
  dataTable('precision-technical','Kontrolę praėjusių subjektų skaičiai, ne individualių kontrolinių žemėlapių rezultatai',['Versija','Modelis','Pastovūs IG / occ.','IG žingsniai 64 / 128 / 256','Parametrai · IG','Etiketės · IG','Parametrai · occ.','Etiketės · occ.','Nepraėjusių dalis min / med. / max'],technical);
  if(d.xai_cohort){const c=d.xai_cohort;byId('xai-cohort-scope').textContent='12 išsaugotų kohortos suvestinių metaduomenys. Originalus subjekto bootstrap: '+count(c.n_bootstrap)+' imčių, seed '+count(c.seed)+'. Ši lentelė aprašo suvestinių apimtį; interpretavimą riboja tie patys nepraeiti stabilumo vartai.';
    dataTable('xai-cohort-results','Išsaugotų grupių metaduomenys; originalūs bootstrap intervalai priklauso šaltinio analizei',['Modelis','Metodas','Grupė','Subjektų n','Neapibrėžtumo būdas','Paskirtis'],c.groups.map(r=>[r.model,r.method==='ig'?'IG':'Occlusion',r.group,count(r.n_subjects),'Subjekto bootstrap','Tik diagnostikai']));
  }else{byId('xai-cohort-scope').textContent='Kohortos XAI suvestinių metaduomenys šio serverio atsakyme nepateikti.';byId('xai-cohort-results').replaceChildren();}
  byId('supplement-detail').hidden=!d.supplement;byId('supplement-results').replaceChildren();
  if(d.supplement){byId('supplement-scope').textContent=d.supplement.scope;d.supplement.sections.forEach(x=>{const heading=document.createElement('h3'),note=document.createElement('p'),host=document.createElement('div');heading.textContent=x.title;note.className='panel-note';note.textContent=x.note;byId('supplement-results').append(heading,note);if(!x.chart&&!x.heatmaps)supplementNumericChart(x);if(x.chart)supplementChart(x.chart,x.title);if(x.heatmaps)supplementHeatmaps(x.heatmaps,x.title);byId('supplement-results').append(host);dataTable(host,x.title,x.headers,x.rows);});}
  byId('benchmark-scope').textContent=d.benchmark_scope;dataTable('benchmark-results','Milisekundės vienam subjektui; n išsaugotas atskirai kiekvienam keliui',['Modelis','Visa grandinė · med. ms','p95 ms','n','Parengta įvestis · med. ms','p95 ms','n'],d.benchmark.map(r=>[r.model,precise(r.full_ms),precise(r.full_p95),count(r.full_n),precise(r.prepared_ms),precise(r.prepared_p95),count(r.prepared_n)]));
  byId('benchmark-context').replaceChildren();
  d.benchmark_context.forEach(r=>{const host=document.createElement('div');byId('benchmark-context').appendChild(host);
    dataTable(host,r.profile==='full'?'Visa prognozės grandinė · išsaugotos sąlygos':'Parengta reprezentacija · išsaugotos sąlygos',['Sąlyga','Reikšmė'],[
      ['Matavimo profilis',r.methodology_profile],['Šaltinio aprėptis',r.scope],['Neįtraukti etapai',r.excluded_scope],['Įrenginys',r.device],['CPU',r.hardware.cpu_model],['GPU',r.hardware.gpu],['Gijos',count(r.threads)],['Platforma',r.hardware.platform],['PyTorch',r.hardware.torch],['Apšilimų skaičius',count(r.warmup)],['Matavimai vienai tiriamojo ir checkpoint porai',count(r.measurements_per_subject_checkpoint)]]);});
  dataTable('benchmark-sampling','Tikri matavimai ir tiriamojo–checkpoint poros; kartojimai nėra nauji tiriamieji',['Modelis','Visa grandinė · matavimai','Visa grandinė · poros','Parengta · matavimai','Parengta · poros'],d.benchmark.map(r=>[r.model,count(r.full_measurements),count(r.full_pairs),count(r.prepared_measurements),count(r.prepared_pairs)]));
  byId('timing-scope').textContent='Pradžia: '+dateText(d.timing.study_created_utc)+'. Skaičiavimai patikrinti: '+dateText(d.timing.computation_verified_utc)+'. Viso tyrimo skaičiavimo sekundės: '+precise(d.timing.whole_study_compute_seconds)+'. '+d.timing.scope;
  dataTable('time-results','Registruotos modelių operacijos; etapai nepakeičia bendro CPU / GPU laiko matavimo',['Etapas','Modelis','Sekundės','Operacijos'],d.times.map(r=>[stageNames[r.stage]||r.stage,r.model,precise(r.seconds),count(r.operations)]));
  dataTable('xai-time-results','Išsaugotos XAI trukmės; trūkstamos reikšmės nėra nulis',['Vykdymas','Metodas / kontrolė','Sekundžių suma','Operacijos','Ataskaitos'],d.xai_times.map(r=>[r.version==='fp32'?'FP32 · dabartiniai žemėlapiai':'Istorinis vykdymas',xaiTimingNames[r.method],exactNumber(r.seconds),count(r.operations),count(r.reports)]));
  byId('results-source').textContent=d.source_scope;dataTable('results-hashes','Šių importuotų suvestinių failų SHA-256',['Failas','SHA-256'],Object.entries(d.source_hashes));
  renderRegistryPlots(d);
}
function renderCalibration(){
  if(!studyResults)return;const row=studyResults.primary.find(r=>r.model===byId('analysis-model').value);if(!row)return;
  byId('repeat-auc').textContent='OOF AUC per pakartojimą: '+(row.auc_by_repeat?.map((v,i)=>(i+1)+': '+number(v)).join(' · ')||'—');
  byId('repeat-visual').replaceChildren();resultPlot('repeat-visual',row.model+' · penki OOF pakartojimai',(row.auc_by_repeat||[]).map((v,i)=>({label:'Pakartojimas '+(i+1),value:v})),{reference:.5,axis:'AUC',note:'Kiekviename pakartojime sujungtos tiriamųjų OOF prognozės. Tai nėra penkios nepriklausomos kohortos; nėra naujo mokymo.'});
  const svg=byId('calibration-chart');svg.replaceChildren();const curve=row.calibration_curve;
  if(!curve||!curve.prob_pred.length){svg.toggleAttribute('hidden',true);dataTable('calibration-table','Kalibracijos duomenų nėra',['Prognozuota tikimybė','Stebėta dalis'],[]);return;}
  svg.toggleAttribute('hidden',false);const ink=getComputedStyle(hosts[0].host).getPropertyValue('--ink').trim(),teal=getComputedStyle(hosts[0].host).getPropertyValue('--teal').trim();
  svgElement(svg,'line',{x1:48,y1:232,x2:390,y2:26,stroke:ink,'stroke-dasharray':'4 5',opacity:.5});
  svgElement(svg,'path',{d:'M48 26V232H390',fill:'none',stroke:ink});
  for(const v of [0,.5,1]){svgElement(svg,'text',{x:48+342*v,y:252,'text-anchor':'middle',fill:ink,'font-size':13},String(v).replace('.',','));svgElement(svg,'text',{x:36,y:236-206*v,'text-anchor':'end',fill:ink,'font-size':13},String(v).replace('.',','));}
  svgElement(svg,'text',{x:219,y:276,'text-anchor':'middle',fill:ink,'font-size':13},'Prognozuota tikimybė');
  svgElement(svg,'text',{x:48,y:16,fill:ink,'font-size':13},'Stebėta dalis');
  curve.prob_pred.forEach((p,i)=>svgElement(svg,'circle',{cx:48+342*p,cy:232-206*curve.prob_true[i],r:4,fill:teal}));
  dataTable('calibration-table',row.model+' · ne tušti kalibracijos intervalai',['Prognozuota tikimybė','Stebėta dalis'],curve.prob_pred.map((p,i)=>[number(p),number(curve.prob_true[i])]));
}

function xaiLabel(label){return ({left_frontal:'Kairė priekinė',left_central:'Kairė centrinė',left_parietal:'Kairė momeninė',left_occipital:'Kairė pakaušio',left_temporal:'Kairė smilkinio',right_frontal:'Dešinė priekinė',right_central:'Dešinė centrinė',right_parietal:'Dešinė momeninė',right_occipital:'Dešinė pakaušio',right_temporal:'Dešinė smilkinio',midline:'Vidurio linija'})[label]||label;}

const results = byId("results-details");
const diagnostics = byId("xai-diagnostics");
results.addEventListener("toggle", () => { if (results.open) loadResults(); });
diagnostics.addEventListener("toggle", () => { if (diagnostics.open && !xaiDiagnostics) loadDiagnostics(); });
byId("analysis-model").addEventListener("change", renderCalibration);
for (const id of ["diagnostics-model", "diagnostics-score", "diagnostics-baseline-metric", "diagnostics-convergence-metric"]) {
  byId(id).addEventListener("change", renderDiagnostics);
}
function syncFragment() {
  if (location.hash === "#registras") results.open = true;
  if (location.hash === "#post-hoc") diagnostics.open = true;
}
window.addEventListener("hashchange", syncFragment);
syncFragment();
results.open = true;
loadResults();
})();
