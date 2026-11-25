"use strict";

const $ = id => document.getElementById(id);
const BANDS = ["WPLI θ · 4–8 Hz", "WPLI α · 8–13 Hz", "WPLI β · 13–30 Hz",
  "oAEC δ · 1–4 Hz", "oAEC θ · 4–8 Hz", "oAEC α · 8–13 Hz", "oAEC β · 13–30 Hz"];
const REGIONS = {
  left_frontal:"Kairė priekinė", right_frontal:"Dešinė priekinė",
  left_central:"Kairė centrinė", right_central:"Dešinė centrinė",
  left_parietal:"Kairė momeninė", right_parietal:"Dešinė momeninė",
  left_occipital:"Kairė pakaušio", right_occipital:"Dešinė pakaušio",
  left_temporal:"Kairė smilkinio", right_temporal:"Dešinė smilkinio", midline:"Vidurio linija"
};
const METRICS = [
  ["mean_auc","Vidutinis AUC","#6aebbd","auc_by_repeat"],
  ["auc_of_mean_probability","AUC iš vidutinių tikimybių","#7fc9ff",null],
  ["balanced_accuracy","Subalansuotas tikslumas","#bbadff","balanced_accuracy_by_repeat"],
  ["sensitivity","Jautrumas","#ffb16a","sensitivity_by_repeat"],
  ["specificity","Specifiškumas","#f7a4d4","specificity_by_repeat"],
  ["brier","Brier balas","#f5db76","brier_by_repeat"]
];
const fmt = (n, digits=3) => Number.isFinite(n) ? n.toLocaleString("lt-LT", {maximumFractionDigits:digits}) : "—";
const exact = n => Number.isFinite(n) ? String(n).replace(".", ",") : "—";
const formatCI = ci => ci?.length === 2 ? ci.map(v=>fmt(v,4)).join(" – ") : "—";
const radians = degrees => degrees * Math.PI / 180;
const limit = (v, min, max) => Math.min(max, Math.max(min, v));

function node(tag, value) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  return element;
}

function options(id, rows, preferred) {
  const select = $(id);
  const previous = preferred ?? select.value;
  select.replaceChildren(...rows.map(([value, label])=>new Option(label,value)));
  if (rows.some(([value])=>String(value)===previous)) select.value=previous;
}

function table(id, header, rows, metricColors) {
  const t = node("table");
  const tr = t.createTHead().insertRow();
  header.forEach(label=>{const th=node("th",label);th.scope="col";tr.append(th);});
  const body=t.createTBody();
  rows.forEach((values, i)=>{
    const row=body.insertRow();
    const label=node("th",values[0]);label.scope="row";
    if (metricColors?.[i]) {
      label.className="metric-name";
      label.style.setProperty("--metric-color",metricColors[i]);
    }
    row.append(label);
    values.slice(1).forEach(value=>{row.insertCell().textContent=value;});
  });
  $(id).replaceChildren(t);
}

function signedColor(value, max) {
  const ratio=max ? limit(Math.abs(value)/max,0,1) : 0;
  const base=[24,38,50], end=value<0?[255,175,98]:[84,236,208];
  return "rgb("+base.map((v,i)=>Math.round(v+(end[i]-v)*ratio)).join(",")+")";
}

function explorer(data) {
  const geometry=data.geometry;
  const xai=data.registry.supplement.sections.find(section=>section.heatmaps).heatmaps;
  const canvas=$("head"), ctx=canvas.getContext("2d");
  let drawAnatomy;
  function anatomyUnavailable() {
    $("anatomy-status").textContent="3D anatomijos parodyti nepavyko. Galima sukti jutiklių tinklą ir peržiūrėti matricas.";
    $("anatomy-status").hidden=false;
    $("hemisphere").disabled=true;
  }
  try {
    drawAnatomy=anatomyRenderer($("anatomy"),window.EEG_ANATOMY);
  } catch (error) {
    anatomyUnavailable();
    console.warn(error);
  }
  $("anatomy").addEventListener("webglcontextlost",()=>{
    drawAnatomy=null;
    anatomyUnavailable();
  });

  const unit=Math.max(...geometry.coordinates.map(p=>Math.hypot(...p)));
  const maxEdges={connectivity:8128,ig:55,occlusion:55};
  const orientation={yaw:-10,pitch:19};
  let view, edges=[], selected=[], drawnPoints=[], drag=null;

  function camera() {
    const a=radians(orientation.yaw), b=radians(orientation.pitch);
    const ca=Math.cos(a), sa=Math.sin(a), cb=Math.cos(b), sb=Math.sin(b);
    return [ca,cb*sa,sb*sa,-sa,cb*ca,sb*ca,0,-sb,cb];
  }

  function scalpContour(project) {
    const points=geometry.coordinates.map(p=>project(p.map(v=>v/unit))).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const half=ordered=>{
      const hull=[];
      for (const p of ordered) {
        while (hull.length>=2&&cross(hull.at(-2),hull.at(-1),p)<=0) hull.pop();
        hull.push(p);
      }
      return hull.slice(0,-1);
    };
    const hull=[...half(points),...half(points.reverse())];
    ctx.beginPath();
    hull.forEach(([x,y],i)=>{
      const [nextX,nextY]=hull[(i+1)%hull.length];
      const mid=[(x+nextX)/2,(y+nextY)/2];
      if (i===0) ctx.moveTo(...mid);
      else ctx.quadraticCurveTo(x,y,...mid);
    });
    ctx.quadraticCurveTo(hull[0][0],hull[0][1],(hull[0][0]+hull[1][0])/2,(hull[0][1]+hull[1][1])/2);
    ctx.closePath();
    ctx.fillStyle="rgba(146,183,212,.035)";ctx.fill();
    ctx.lineWidth=1.5;ctx.strokeStyle="rgba(156,195,218,.45)";ctx.stroke();
  }

  function compass(project) {
    ctx.fillStyle="#dce8f4";
    ctx.font="600 19px system-ui";
    ctx.textAlign="center";
    const front=project([0,.92,.26]);
    ctx.fillText("PRIEKIS",front[0],front[1]-12);
    for (const [x,label] of [[-.83,"K"],[.83,"D"]]) {
      const p=project([x,0,.32]);
      ctx.fillText(label,p[0],p[1]+5);
    }
  }

  let previousCamera="";
  function drawHead() {
    const m=camera();
    const project=([x,y,z])=>{
      const depth=m[2]*x+m[5]*y+m[8]*z, scale=300*(1+depth*.19);
      return [400+scale*(m[0]*x+m[3]*y),322-scale*(m[1]*x+m[4]*y+m[7]*z),depth];
    };
    const hemisphere=$("hemisphere").value;
    const key=[orientation.yaw,orientation.pitch,hemisphere].join("/");
    if (key!==previousCamera) {
      drawAnatomy?.(m,hemisphere);
      previousCamera=key;
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if ($("show-network").checked) scalpContour(project);
    compass(project);
    drawnPoints=[];
    if (!$("show-network").checked) return;
    drawnPoints=view.coordinates.map(p=>project(p.map(v=>v/unit)));
    const from=Number($("node-a").value), to=Number($("node-b").value);
    const line=(a,b,weight,active=false)=>{
      ctx.beginPath();ctx.moveTo(...drawnPoints[a].slice(0,2));ctx.lineTo(...drawnPoints[b].slice(0,2));
      ctx.strokeStyle=active?"#fff5cf":signedColor(weight,view.scale);
      ctx.globalAlpha=active?1:.26+.64*Math.min(1,Math.abs(weight)/(view.scale||1));
      ctx.lineWidth=active?3.5:1.7;ctx.stroke();
    };
    selected.forEach(e=>line(...e));
    if(from!==to)line(from,to,view.active[from][to],true);
    ctx.globalAlpha=1;
    drawnPoints.map((p,i)=>[i,p]).sort((a,b)=>a[1][2]-b[1][2]).forEach(([i,p])=>{
      const marked=i===from||i===to;
      ctx.beginPath();ctx.arc(p[0],p[1],marked?6:view.names.length===11?5:2.6,0,Math.PI*2);
      ctx.fillStyle=marked?"#ffedbd":"#bdd7ea";ctx.fill();
      if(marked){ctx.fillStyle="#fff5dc";ctx.font="bold 18px system-ui";ctx.textAlign="left";ctx.fillText(view.names[i],p[0]+9,p[1]-6);}
    });
  }

  function drawMatrix(canvasId, matrix) {
    const current=$(canvasId), drawing=current.getContext("2d");
    const width=current.width/matrix.length;
    matrix.forEach((row,i)=>row.forEach((v,j)=>{
      drawing.fillStyle=signedColor(v,view.scale);
      drawing.fillRect(Math.floor(j*width),Math.floor(i*width),Math.ceil(width),Math.ceil(width));
    }));
    drawing.strokeStyle="#fff5cf";drawing.lineWidth=2;
    drawing.strokeRect(Number($("node-b").value)*width,Number($("node-a").value)*width,width,width);
  }

  function drawSelection() {
    const a=Number($("node-a").value), b=Number($("node-b").value);
    const hc=view.hc[a][b], mdd=view.mdd[a][b];
    $("pair-values").textContent=view.names[a]+" × "+view.names[b]+" · HC "+exact(hc)+" · MDD "+exact(mdd)+" · Δ "+exact(mdd-hc);
    drawMatrix("map-hc",view.hc);drawMatrix("map-mdd",view.mdd);drawHead();
  }

  function drawEdges() {
    const n=Number($("edge-limit").value);
    selected=edges.slice(0,n);
    $("edge-limit-value").textContent=String(n);
    $("graph-note").textContent=$("group").selectedOptions[0].textContent+" · "+selected.length+" / "+maxEdges[view.layer]+
      " briaunų ("+fmt(100*selected.length/maxEdges[view.layer],2)+" %). Rodomos didžiausios |reikšmės|. Šviesi pasirinkta pora rodoma papildomai.";
    drawHead();
  }

  function update() {
    const layer=$("layer").value, group=$("group").value, band=Number($("band").value);
    const regional=layer!=="connectivity";
    $("xai-model-label").hidden=!regional;
    const model=$("xai-model").value;
    const mapFor=key=>{
      if(!regional)return geometry.maps[key][band];
      const source=data.aggregates["xai_groups.json"];
      // Supplement order is model → method → class, identified by its saved display name.
      const prefix=model+" · "+(layer==="ig"?"IG · regionų vidurkis":"Regionų okliuzija")+" · "+key;
      if (!source.some(r=>r.model===model && r.method===layer && r.true_class===Number(key==="MDD"))) {
        throw Error("Trūksta pasirinktos XAI grupės");
      }
      return xai.groups.find(record=>record.name===prefix).maps[band];
    };
    const hc=mapFor("HC"),mdd=mapFor("MDD");
    const active=group==="delta"?mdd.map((row,i)=>row.map((v,j)=>v-hc[i][j])):group==="HC"?hc:mdd;
    // Both panels keep one scale across groups; Δ also uses that scale unless it exceeds it.
    const scale=[hc,mdd,active].reduce((max,matrix)=>
      matrix.reduce((outer,row)=>row.reduce((inner,v)=>Math.max(inner,Math.abs(v)),outer),max),0);
    const names=regional?xai.labels.map(n=>REGIONS[n]):geometry.channels;
    const coordinates=regional?xai.labels.map(n=>geometry.region_coordinates[n]):geometry.coordinates;
    const changedLayer=view?.layer!==layer;
    view={layer,names,coordinates,hc,mdd,active,scale};
    if(changedLayer){
      options("node-a",names.map((name,i)=>[i,name]),"0");
      options("node-b",names.map((name,i)=>[i,name]),"1");
      $("edge-limit").max=String(Math.min(maxEdges[layer],500));
      $("edge-limit").value=regional?"24":"72";
    }
    edges=[];
    active.forEach((row,i)=>row.forEach((weight,j)=>{
      if(j>i&&weight!==0)edges.push([i,j,weight]);
    }));
    edges.sort((a,b)=>Math.abs(b[2])-Math.abs(a[2])||a[0]-b[0]||a[1]-b[1]);
    $("matrix-title").textContent=(regional?"Regionų diagnostika":"Junglumo vidurkiai")+" · "+hc.length+" × "+hc.length;
    $("scale-min").textContent=fmt(scale,5);
    $("scale-max").textContent=fmt(scale,5);
    $("map-note").textContent=regional
      ?"Diagnostiniai "+model+" logito indėliai arba pokyčiai. Stabilumas 0/51. Spalvų skalė bendra, regionų taškai yra jutiklių grupių centrai."
      :"Kiekvieno dalyvio 10 testavimo vaizdų suvidurkinti. Visi grupės dalyviai turi vienodą svorį. MDD − HC skirtumas aprašomasis. Abiejų matricų skalė bendra.";
    drawEdges();drawSelection();
  }

  options("band",BANDS.map((name,i)=>[i,name]),"1");
  options("xai-model",["M1","M1-TF","M2-TFA"].map(name=>[name,name]),"M2-TFA");
  ["layer","group","band","xai-model"].forEach(id=>$(id).addEventListener("change",update));
  ["node-a","node-b"].forEach(id=>$(id).addEventListener("change",drawSelection));
  $("edge-limit").addEventListener("input",drawEdges);
  ["hemisphere","show-network"].forEach(id=>$(id).addEventListener("change",drawHead));
  ["yaw","pitch"].forEach(id=>$(id).addEventListener("input",()=>{orientation[id]=Number($(id).value);drawHead();}));
  $("reset").addEventListener("click",()=>{
    orientation.yaw=orientation.pitch=0;$("yaw").value=$("pitch").value="0";drawHead();
  });
  canvas.addEventListener("pointerdown",e=>{drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener("pointermove",e=>{
    if(!drag)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(Math.abs(dx)+Math.abs(dy)>1)drag.moved=true;
    orientation.yaw=((orientation.yaw+dx*.8+540)%360)-180;
    orientation.pitch=limit(orientation.pitch+dy*.8,-80,80);
    drag.x=e.clientX;drag.y=e.clientY;$("yaw").value=String(orientation.yaw);$("pitch").value=String(orientation.pitch);
    drawHead();
  });
  canvas.addEventListener("pointerup",e=>{
    if(drag&&!drag.moved){
      const rect=canvas.getBoundingClientRect();
      const x=(e.clientX-rect.left)/rect.width*canvas.width,y=(e.clientY-rect.top)/rect.height*canvas.height;
      const index=drawnPoints.findIndex(p=>Math.hypot(x-p[0],y-p[1])<9);
      if(index>=0){$("node-a").value=$("node-b").value;$("node-b").value=String(index);drawSelection();}
    }
    drag=null;
  });
  canvas.addEventListener("pointercancel",()=>{drag=null;});
  ["map-hc","map-mdd"].forEach(id=>$(id).addEventListener("click",e=>{
    const rect=e.currentTarget.getBoundingClientRect(),n=view.names.length;
    $("node-a").value=String(limit(Math.floor(n*(e.clientY-rect.top)/rect.height),0,n-1));
    $("node-b").value=String(limit(Math.floor(n*(e.clientX-rect.left)/rect.width),0,n-1));
    drawSelection();
  }));
  $("download-matrix").addEventListener("click",()=>{
    const csv=["group,row,column,value"];
    for(const group of ["hc","mdd"]){
      view[group].forEach((row,i)=>row.forEach((value,j)=>csv.push([group.toUpperCase(),view.names[i],view.names[j],value].join(","))));
    }
    const url=URL.createObjectURL(new Blob([csv.join("\n")],{type:"text/csv;charset=utf-8"}));
    const link=node("a");link.href=url;link.download=view.layer+"-"+geometry.bands[Number($("band").value)]+".csv";
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  update();
  $("reset").disabled=$("download-matrix").disabled=false;
}

function performance(data) {
  const { registry, primary, aggregates }=data;
  const allValid=Object.fromEntries(Object.entries(aggregates["all_valid.json"]).map(([name,record])=>
    [name,{...record.single_input,ci95:record.paired_subject_bootstrap?.ci95}]));
  const stages=[
    {key:"primary",label:"Pagrindinis tyrimas",models:primary},
    ...registry.stages.filter(s=>s.key!=="primary"),
    {key:"all-valid",label:"Visos tinkamos epochos",models:allValid}
  ];
  options("stage",stages.map(s=>[s.key,s.label]),"primary");
  options("metric",METRICS.map(([key,name])=>[key,name]),"mean_auc");
  let selectedModel="M2-TFA";
  function render(){
    const stage=stages.find(s=>s.key===$("stage").value);
    const [metric,label,color]=METRICS.find(m=>m[0]===$("metric").value);
    const rows=registry.models.filter(name=>Object.hasOwn(stage.models,name)).map(name=>[name,stage.models[name]]);
    options("repeat-model",rows.map(([name])=>[name,name]),selectedModel);
    selectedModel=$("repeat-model").value;
    $("metric-title").textContent=label+" · "+stage.label;
    const chart=$("metric-chart");
    chart.replaceChildren();
    for(const [model,value] of rows){
      const row=node("div");row.className="metric-row";
      const button=node("button",model);button.type="button";
      button.title="Atverti "+model+" metrikas";button.setAttribute("aria-pressed",String(model===selectedModel));
      button.addEventListener("click",()=>{selectedModel=model;render();chart.querySelector('[aria-pressed="true"]').focus();});
      const track=node("div");track.className="metric-track";track.setAttribute("aria-hidden","true");
      const v=value[metric];const ci=metric==="mean_auc"?(value.ci95||value.bootstrap?.ci95):null;
      if(metric.includes("auc")){const ref=node("span");ref.className="ref";ref.style.left="50%";track.append(ref);}
      if(Number.isFinite(v)){
        const bar=node("i");bar.style.width=100*v+"%";bar.style.background=color;track.append(bar);
        if(ci?.length===2){
          const range=node("i");range.className="ci";range.style.left=100*ci[0]+"%";range.style.width=100*(ci[1]-ci[0])+"%";
          const dot=node("i");dot.className="dot";dot.style.left=100*v+"%";dot.style.background="#fff";
          track.append(range,dot);
        }
      }
      const shown=node("span",fmt(v,4));shown.title=exact(v)+(ci?" · 95 % intervalas "+formatCI(ci):"");
      row.append(button,track,shown);chart.append(row);
    }
    const missing=rows.filter(([,r])=>!Number.isFinite(r[metric])).length;
    $("metric-note").textContent=(metric==="brier"?"Mažesnis Brier balas geriau. ":"")+
      (metric.includes("auc")?"Vertikali linija žymi AUC 0,5. ":"")+
      (missing?missing+" modelių ši metrika nepateikta. ":"")+"Pasirinkus modelį rodoma jo lentelė.";
    const row=stage.models[selectedModel];
    const repeats=Math.max(0,...METRICS.map(([, , ,key])=>row?.[key]?.length||0));
    table("repeat-table",["Metrika","Suvestinė",...Array.from({length:repeats},(_,i)=>"Kart. "+(i+1))],
      METRICS.map(([key,name,,rep])=>[name,exact(row?.[key]),...Array.from({length:repeats},(_,i)=>exact(row?.[rep]?.[i]))]),
      METRICS.map(m=>m[2]));
    table("metrics-table",["Modelis",...METRICS.map(m=>m[1]),"AUC 95 % intervalas","Būsena"],
      rows.map(([name,r])=>[name,...METRICS.map(([key])=>exact(r[key])),formatCI(r.ci95||r.bootstrap?.ci95),
        r.status==="NOT_ESTIMABLE"?"Neįvertinama":r.status||"Išsaugota"]));
  }
  ["stage","metric"].forEach(id=>$(id).addEventListener("change",render));
  $("repeat-model").addEventListener("change",e=>{selectedModel=e.target.value;render();});
  render();
}

function sourceTable(aggregates) {
  const tableRows = {};
  function flatten(value, path, rows) {
    if (value === null || typeof value !== "object") {
      rows.push([path, value === null ? "—" : typeof value === "number" ? exact(value) : String(value)]);
      return;
    }
    Object.entries(value).forEach(([key, item]) => {
      if (key !== "heatmaps") flatten(item, path ? path + " / " + key : key, rows);
    });
  }
  const sources=Object.keys(aggregates);
  options("source-select",sources.map(name=>[name,name]),"primary.json");
  function render() {
    if (!$("source-details").open) return;
    const source=$("source-select").value;
    if (!Object.hasOwn(tableRows, source)) {
      tableRows[source]=[];
      flatten(aggregates[source],"",tableRows[source]);
    }
    const filter=$("source-filter").value.trim().toLowerCase();
    const rows=tableRows[source].filter(([name])=>name.toLowerCase().includes(filter));
    $("source-status").textContent="Laukų skaičius – "+fmt(rows.length);
    table("source-table",["Laukas","Reikšmė"],rows);
  }
  $("source-details").addEventListener("toggle",render);
  $("source-select").addEventListener("change",render);
  $("source-filter").addEventListener("input",render);
}

function init(data) {
  const {registry:r}=data;
  const headline=[[String(r.study.subjects),"Dalyvis (24 MDD · 27 HC)"],[String(r.models.length),"Modelių, įskaitant C0"],
    [fmt(data.primary["M2-TFA"].mean_auc),"M2-TFA · geriausias EEG AUC"],[fmt(data.primary.C0.mean_auc),"C0 · demografinės kontrolės AUC"]];
  headline.forEach(([number,label])=>{
    const card=node("div");card.className="stat";card.append(node("b",number),node("small",label));
    $("headline-stats").append(card);
  });
  explorer(data);
  performance(data);
  sourceTable(data.aggregates);
  const cells=Object.entries(r.xai_precision.new).map(([name,s])=>[name,s.ig_completeness_pass_subjects+"/"+s.subjects,
    s.ig_stability_pass+"/"+s.subjects,s.occlusion_stability_pass+"/"+s.subjects,
    formatCI([s.ig_median_rho_range.min,s.ig_median_rho_range.max]),
    formatCI([s.occlusion_median_rho_range.min,s.occlusion_median_rho_range.max])]);
  table("xai-gates",["Modelis","IG pilnumas","IG stabilumas","Okliuzijos stabilumas","IG ρ min–max","Okliuzijos ρ min–max"],cells);
  $("unavailable").textContent=Object.entries(data.unavailable).map(([name,r])=>
    "Palyginimas "+name+" ("+r.a+" ir "+r.b+") neatliktas, nes į tyrimą neįtraukti abu numatyti modeliai.").join(" ");
}

try {
  init(window.EEG_STUDY);
} catch (error) {
  $("error").hidden=false;
  $("error").textContent="Rezultatų įkelti nepavyko. Patikrinkite, ar išskleisti visi atlaso failai.";
  console.error(error);
}

const sectionLinks=[...document.querySelectorAll(".top nav a")];
const sections=sectionLinks.map(link=>document.querySelector(link.hash));
let navigationFrame=0;
function updateNavigation() {
  const edge=document.querySelector(".top").getBoundingClientRect().bottom+24;
  const current=sections.findLastIndex(section=>section?.getBoundingClientRect().top<=edge);
  sectionLinks.forEach((link,i)=>{
    if (i===current) link.setAttribute("aria-current","location");
    else link.removeAttribute("aria-current");
  });
  navigationFrame=0;
}
function scheduleNavigation() {
  if (!navigationFrame) navigationFrame=requestAnimationFrame(updateNavigation);
}
window.addEventListener("scroll",scheduleNavigation,{passive:true});
window.addEventListener("resize",scheduleNavigation);
window.addEventListener("load",scheduleNavigation);
