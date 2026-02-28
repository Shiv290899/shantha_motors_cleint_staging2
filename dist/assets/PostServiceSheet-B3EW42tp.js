import{r as s,j as i}from"./index-Cpnbu_hS.js";import{o as L,ai as fe,ae as xe,_ as U,f as _,S as oe,l as ye,p as Se,O as we,c as ee,e as K,j as le,m as Ne,q as je,r as $e,F as Me,u as E,aj as Ce,L as Re,ak as Te,n as Ie,H as Pe}from"./TextArea-R_tc8-o2.js";import{d as Oe}from"./index-6X0CyMNZ.js";var te=function(t,a){if(!t)return null;var n={left:t.offsetLeft,right:t.parentElement.clientWidth-t.clientWidth-t.offsetLeft,width:t.clientWidth,top:t.offsetTop,bottom:t.parentElement.clientHeight-t.clientHeight-t.offsetTop,height:t.clientHeight};return a?{left:0,right:0,width:0,top:n.top,bottom:n.bottom,height:n.height}:{left:n.left,right:n.right,width:n.width,top:0,bottom:0,height:0}},I=function(t){return t!==void 0?"".concat(t,"px"):void 0};function He(e){var t=e.prefixCls,a=e.containerRef,n=e.value,r=e.getValueIndex,l=e.motionName,o=e.onMotionStart,v=e.onMotionEnd,p=e.direction,x=e.vertical,c=x===void 0?!1:x,u=s.useRef(null),w=s.useState(n),y=L(w,2),S=y[0],N=y[1],C=function(A){var P,F=r(A),O=(P=a.current)===null||P===void 0?void 0:P.querySelectorAll(".".concat(t,"-item"))[F];return O?.offsetParent&&O},H=s.useState(null),h=L(H,2),m=h[0],d=h[1],$=s.useState(null),M=L($,2),g=M[0],D=M[1];fe(function(){if(S!==n){var b=C(S),A=C(n),P=te(b,c),F=te(A,c);N(n),d(P),D(F),b&&A?o():v()}},[n]);var R=s.useMemo(function(){if(c){var b;return I((b=m?.top)!==null&&b!==void 0?b:0)}return I(p==="rtl"?-m?.right:m?.left)},[c,p,m]),T=s.useMemo(function(){if(c){var b;return I((b=g?.top)!==null&&b!==void 0?b:0)}return I(p==="rtl"?-g?.right:g?.left)},[c,p,g]),W=function(){return c?{transform:"translateY(var(--thumb-start-top))",height:"var(--thumb-start-height)"}:{transform:"translateX(var(--thumb-start-left))",width:"var(--thumb-start-width)"}},z=function(){return c?{transform:"translateY(var(--thumb-active-top))",height:"var(--thumb-active-height)"}:{transform:"translateX(var(--thumb-active-left))",width:"var(--thumb-active-width)"}},q=function(){d(null),D(null),v()};return!m||!g?null:s.createElement(xe,{visible:!0,motionName:l,motionAppear:!0,onAppearStart:W,onAppearActive:z,onVisibleChanged:q},function(b,A){var P=b.className,F=b.style,O=U(U({},F),{},{"--thumb-start-left":R,"--thumb-start-width":I(m?.width),"--thumb-active-left":T,"--thumb-active-width":I(g?.width),"--thumb-start-top":R,"--thumb-start-height":I(m?.height),"--thumb-active-top":T,"--thumb-active-height":I(g?.height)}),X={ref:oe(u,A),style:O,className:_("".concat(t,"-thumb"),P)};return s.createElement("div",X)})}var Ae=["prefixCls","direction","vertical","options","disabled","defaultValue","value","name","onChange","className","motionName"];function Ee(e){if(typeof e.title<"u")return e.title;if(le(e.label)!=="object"){var t;return(t=e.label)===null||t===void 0?void 0:t.toString()}}function De(e){return e.map(function(t){if(le(t)==="object"&&t!==null){var a=Ee(t);return U(U({},t),{},{title:a})}return{label:t?.toString(),title:t?.toString(),value:t}})}var ze=function(t){var a=t.prefixCls,n=t.className,r=t.disabled,l=t.checked,o=t.label,v=t.title,p=t.value,x=t.name,c=t.onChange,u=t.onFocus,w=t.onBlur,y=t.onKeyDown,S=t.onKeyUp,N=t.onMouseDown,C=function(h){r||c(h,p)};return s.createElement("label",{className:_(n,K({},"".concat(a,"-item-disabled"),r)),onMouseDown:N},s.createElement("input",{name:x,className:"".concat(a,"-item-input"),type:"radio",disabled:r,checked:l,onChange:C,onFocus:u,onBlur:w,onKeyDown:y,onKeyUp:S}),s.createElement("div",{className:"".concat(a,"-item-label"),title:v,"aria-selected":l},o))},Fe=s.forwardRef(function(e,t){var a,n,r=e.prefixCls,l=r===void 0?"rc-segmented":r,o=e.direction,v=e.vertical,p=e.options,x=p===void 0?[]:p,c=e.disabled,u=e.defaultValue,w=e.value,y=e.name,S=e.onChange,N=e.className,C=N===void 0?"":N,H=e.motionName,h=H===void 0?"thumb-motion":H,m=ye(e,Ae),d=s.useRef(null),$=s.useMemo(function(){return oe(d,t)},[d,t]),M=s.useMemo(function(){return De(x)},[x]),g=Se((a=M[0])===null||a===void 0?void 0:a.value,{value:w,defaultValue:u}),D=L(g,2),R=D[0],T=D[1],W=s.useState(!1),z=L(W,2),q=z[0],b=z[1],A=function(j,B){T(B),S?.(B)},P=we(m,["children"]),F=s.useState(!1),O=L(F,2),X=O[0],Y=O[1],de=s.useState(!1),G=L(de,2),ce=G[0],Q=G[1],me=function(){Q(!0)},ue=function(){Q(!1)},he=function(){Y(!1)},ge=function(j){j.key==="Tab"&&Y(!0)},Z=function(j){var B=M.findIndex(function(ve){return ve.value===R}),J=M.length,pe=(B+j+J)%J,k=M[pe];k&&(T(k.value),S?.(k.value))},be=function(j){switch(j.key){case"ArrowLeft":case"ArrowUp":Z(-1);break;case"ArrowRight":case"ArrowDown":Z(1);break}};return s.createElement("div",ee({role:"radiogroup","aria-label":"segmented control",tabIndex:c?void 0:0},P,{className:_(l,(n={},K(n,"".concat(l,"-rtl"),o==="rtl"),K(n,"".concat(l,"-disabled"),c),K(n,"".concat(l,"-vertical"),v),n),C),ref:$}),s.createElement("div",{className:"".concat(l,"-group")},s.createElement(He,{vertical:v,prefixCls:l,value:R,containerRef:d,motionName:"".concat(l,"-").concat(h),direction:o,getValueIndex:function(j){return M.findIndex(function(B){return B.value===j})},onMotionStart:function(){b(!0)},onMotionEnd:function(){b(!1)}}),M.map(function(f){var j;return s.createElement(ze,ee({},f,{name:y,key:f.value,prefixCls:l,className:_(f.className,"".concat(l,"-item"),(j={},K(j,"".concat(l,"-item-selected"),f.value===R&&!q),K(j,"".concat(l,"-item-focused"),ce&&X&&f.value===R),j)),checked:f.value===R,onChange:A,onFocus:me,onBlur:ue,onKeyDown:be,onKeyUp:ge,onMouseDown:he,disabled:!!c||!!f.disabled}))})))}),Le=Fe;function ie(e,t){return{[`${e}, ${e}:hover, ${e}:focus`]:{color:t.colorTextDisabled,cursor:"not-allowed"}}}function ae(e){return{backgroundColor:e.itemSelectedBg,boxShadow:e.boxShadowTertiary}}const Be=Object.assign({overflow:"hidden"},Re),Ve=e=>{const{componentCls:t}=e,a=e.calc(e.controlHeight).sub(e.calc(e.trackPadding).mul(2)).equal(),n=e.calc(e.controlHeightLG).sub(e.calc(e.trackPadding).mul(2)).equal(),r=e.calc(e.controlHeightSM).sub(e.calc(e.trackPadding).mul(2)).equal();return{[t]:Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({},$e(e)),{display:"inline-block",padding:e.trackPadding,color:e.itemColor,background:e.trackBg,borderRadius:e.borderRadius,transition:`all ${e.motionDurationMid} ${e.motionEaseInOut}`}),Me(e)),{[`${t}-group`]:{position:"relative",display:"flex",alignItems:"stretch",justifyItems:"flex-start",flexDirection:"row",width:"100%"},[`&${t}-rtl`]:{direction:"rtl"},[`&${t}-vertical`]:{[`${t}-group`]:{flexDirection:"column"},[`${t}-thumb`]:{width:"100%",height:0,padding:`0 ${E(e.paddingXXS)}`}},[`&${t}-block`]:{display:"flex"},[`&${t}-block ${t}-item`]:{flex:1,minWidth:0},[`${t}-item`]:{position:"relative",textAlign:"center",cursor:"pointer",transition:`color ${e.motionDurationMid} ${e.motionEaseInOut}`,borderRadius:e.borderRadiusSM,transform:"translateZ(0)","&-selected":Object.assign(Object.assign({},ae(e)),{color:e.itemSelectedColor}),"&-focused":Ce(e),"&::after":{content:'""',position:"absolute",zIndex:-1,width:"100%",height:"100%",top:0,insetInlineStart:0,borderRadius:"inherit",opacity:0,transition:`opacity ${e.motionDurationMid}`,pointerEvents:"none"},[`&:hover:not(${t}-item-selected):not(${t}-item-disabled)`]:{color:e.itemHoverColor,"&::after":{opacity:1,backgroundColor:e.itemHoverBg}},[`&:active:not(${t}-item-selected):not(${t}-item-disabled)`]:{color:e.itemHoverColor,"&::after":{opacity:1,backgroundColor:e.itemActiveBg}},"&-label":Object.assign({minHeight:a,lineHeight:E(a),padding:`0 ${E(e.segmentedPaddingHorizontal)}`},Be),"&-icon + *":{marginInlineStart:e.calc(e.marginSM).div(2).equal()},"&-input":{position:"absolute",insetBlockStart:0,insetInlineStart:0,width:0,height:0,opacity:0,pointerEvents:"none"}},[`${t}-thumb`]:Object.assign(Object.assign({},ae(e)),{position:"absolute",insetBlockStart:0,insetInlineStart:0,width:0,height:"100%",padding:`${E(e.paddingXXS)} 0`,borderRadius:e.borderRadiusSM,transition:`transform ${e.motionDurationSlow} ${e.motionEaseInOut}, height ${e.motionDurationSlow} ${e.motionEaseInOut}`,[`& ~ ${t}-item:not(${t}-item-selected):not(${t}-item-disabled)::after`]:{backgroundColor:"transparent"}}),[`&${t}-lg`]:{borderRadius:e.borderRadiusLG,[`${t}-item-label`]:{minHeight:n,lineHeight:E(n),padding:`0 ${E(e.segmentedPaddingHorizontal)}`,fontSize:e.fontSizeLG},[`${t}-item, ${t}-thumb`]:{borderRadius:e.borderRadius}},[`&${t}-sm`]:{borderRadius:e.borderRadiusSM,[`${t}-item-label`]:{minHeight:r,lineHeight:E(r),padding:`0 ${E(e.segmentedPaddingHorizontalSM)}`},[`${t}-item, ${t}-thumb`]:{borderRadius:e.borderRadiusXS}}}),ie(`&-disabled ${t}-item`,e)),ie(`${t}-item-disabled`,e)),{[`${t}-thumb-motion-appear-active`]:{transition:`transform ${e.motionDurationSlow} ${e.motionEaseInOut}, width ${e.motionDurationSlow} ${e.motionEaseInOut}`,willChange:"transform, width"},[`&${t}-shape-round`]:{borderRadius:9999,[`${t}-item, ${t}-thumb`]:{borderRadius:9999}}})}},Ke=e=>{const{colorTextLabel:t,colorText:a,colorFillSecondary:n,colorBgElevated:r,colorFill:l,lineWidthBold:o,colorBgLayout:v}=e;return{trackPadding:o,trackBg:v,itemColor:t,itemHoverColor:a,itemHoverBg:n,itemSelectedBg:r,itemActiveBg:l,itemSelectedColor:a}},We=Ne("Segmented",e=>{const{lineWidth:t,calc:a}=e,n=je(e,{segmentedPaddingHorizontal:a(e.controlPaddingHorizontal).sub(t).equal(),segmentedPaddingHorizontalSM:a(e.controlPaddingHorizontalSM).sub(t).equal()});return Ve(n)},Ke);var ne=function(e,t){var a={};for(var n in e)Object.prototype.hasOwnProperty.call(e,n)&&t.indexOf(n)<0&&(a[n]=e[n]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var r=0,n=Object.getOwnPropertySymbols(e);r<n.length;r++)t.indexOf(n[r])<0&&Object.prototype.propertyIsEnumerable.call(e,n[r])&&(a[n[r]]=e[n[r]]);return a};function qe(e){return typeof e=="object"&&!!e?.icon}const _e=s.forwardRef((e,t)=>{const a=Te(),{prefixCls:n,className:r,rootClassName:l,block:o,options:v=[],size:p="middle",style:x,vertical:c,shape:u="default",name:w=a}=e,y=ne(e,["prefixCls","className","rootClassName","block","options","size","style","vertical","shape","name"]),{getPrefixCls:S,direction:N,className:C,style:H}=Ie("segmented"),h=S("segmented",n),[m,d,$]=We(h),M=Pe(p),g=s.useMemo(()=>v.map(T=>{if(qe(T)){const{icon:W,label:z}=T,q=ne(T,["icon","label"]);return Object.assign(Object.assign({},q),{label:s.createElement(s.Fragment,null,s.createElement("span",{className:`${h}-item-icon`},W),z&&s.createElement("span",null,z))})}return T}),[v,h]),D=_(r,l,C,{[`${h}-block`]:o,[`${h}-sm`]:M==="small",[`${h}-lg`]:M==="large",[`${h}-vertical`]:c,[`${h}-shape-${u}`]:u==="round"},d,$),R=Object.assign(Object.assign({},H),x);return m(s.createElement(Le,Object.assign({},y,{name:w,className:D,style:R,options:g,ref:t,prefixCls:h,direction:N,vertical:c})))}),tt=_e,V=e=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(Math.max(0,Math.round(Number(e||0)))),Ue=e=>e?Oe(e).format("DD-MM-YYYY HH:mm"):"",it=e=>e?"☑":"☐",Xe=e=>{const t=Math.max(0,Math.floor(Number(e||0)));if(t===0)return"Zero Rupees Only";const a=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],n=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"],r=u=>u<20?a[u]:n[Math.floor(u/10)]+(u%10?" "+a[u%10]:""),l=u=>{const w=Math.floor(u/100),y=u%100;return(w?a[w]+" Hundred"+(y?" ":""):"")+(y?r(y):"")};let o="";const v=Math.floor(t/1e7),p=Math.floor(t/1e5%100),x=Math.floor(t/1e3%100),c=t%1e3;return v&&(o+=l(v)+" Crore "),p&&(o+=r(p)+" Lakh "),x&&(o+=r(x)+" Thousand "),c&&(o+=l(c)),(o.trim()+" Rupees Only").replace(/\s+/g," ")},ke=e=>{if(!e)return e;const t=e.startsWith("http")?e:`${window.location.origin}${e}`,a=Date.now();return t.includes("?")?`${t}&v=${a}`:`${t}?v=${a}`},Ye=e=>{e.querySelectorAll("canvas").forEach(t=>{try{const a=document.createElement("img");a.alt=t.getAttribute("aria-label")||"canvas",a.src=t.toDataURL("image/png"),a.style.maxWidth="100%",a.style.height="auto",t.parentNode&&t.parentNode.replaceChild(a,t)}catch{}})},Ge=e=>{e.querySelectorAll("img").forEach(t=>{const a=t.getAttribute("src");a&&!a.startsWith("data:")&&t.setAttribute("src",ke(a))})},Qe=`
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0 !important; padding: 0 !important; background: #fff !important;
    -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
  }
  * { box-sizing: border-box; }
  img { max-width: 100%; height: auto; background: transparent; }
  .print-wrap { margin: 0 auto; }
  @media print {
    * { transform: none !important; }
    .fixed, .sticky, [style*="position: sticky"], [style*="position: fixed"] { position: static !important; }
    .no-print { display: none !important; }
  }
`,re=(e,t,{inlineFallback:a=!1}={})=>{e.open();const n=a?"<script>setTimeout(function () { try { window.print(); } catch (e) {} }, 300);<\/script>":"";e.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <base href="${location.origin}${location.pathname}">
  <title>Print</title>
  <style>${Qe}</style>
</head>
<body class="print-host">
  <div class="print-wrap">${t}</div>
  ${n}
</body>
</html>`),e.close()},se=async e=>{const t=Array.from(e.images||[]);if(await Promise.all(t.map(a=>a.complete&&a.naturalWidth?Promise.resolve():new Promise(n=>{a.onload=a.onerror=()=>n()}))),e.fonts&&e.fonts.ready)try{await e.fonts.ready}catch{}await new Promise(a=>setTimeout(a,200))};async function at(e){if(!e){window.print();return}await new Promise(o=>setTimeout(o,0));const t=e.cloneNode(!0);if(Ye(t),Ge(t),/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){const o=window.open("","_blank");if(!o){alert("Please allow pop-ups to print.");return}re(o.document,t.outerHTML,{inlineFallback:!1}),await se(o.document);try{o.focus()}catch{}try{o.print()}catch{}return}const n=document.createElement("iframe");n.style.position="fixed",n.style.right="0",n.style.bottom="0",n.style.width="0",n.style.height="0",n.style.border="0",n.setAttribute("aria-hidden","true"),document.body.appendChild(n);const r=n.contentWindow,l=r.document;re(l,t.outerHTML,{inlineFallback:!1}),await se(l);try{r.focus()}catch{}try{r.print()}catch{window.print()}setTimeout(()=>{n.parentNode&&n.parentNode.removeChild(n)},800)}const nt=s.forwardRef(function({active:t,vals:a,totals:n},r){const o=(Array.isArray(a?.labourRows)?a.labourRows:[]).map((d,$)=>({sn:$+1,particulars:d?.desc||"-",qty:Number(d?.qty||0),rate:Number(d?.rate||0),amount:Math.max(0,Number(d?.qty||0)*Number(d?.rate||0))})),v=s.useMemo(()=>o.reduce((d,$)=>d+$.amount,0),[o]),p=Number(a?.gstLabour??0),x=Math.round(Number(n?.labourSub??v)),c=Math.round(Number(n?.labourGST??x*(p/100))),u=Math.round(Number(n?.labourDisc??0)),w=Math.max(0,Math.round(Number(n?.grand??x+c-u))),y=Xe(w),N=(d=>{const $=String(d??"").replace(/\D/g,"");return $?parseInt($,10):null})(a?.km),C=N!=null?N+2e3:null,h=String(a?.branch||"").trim().toLowerCase().includes("byadarahalli"),m=s.useMemo(()=>String(a?.custMobile||"").replace(/\D/g,"").slice(-10)||"",[a?.custMobile]);return i.jsxs("div",{ref:r,className:`print-sheet ${t?"active":""}`,children:[i.jsx("style",{children:`
/* =========================
   PRINT BASELINE (A4)
   ========================= */
@page { size: A4 portrait; margin: 0; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, Helvetica, sans-serif;
}
img { max-width: 100%; height: auto; background: transparent; }

/* Tame layout quirks during print */
@media print {
  * { transform: none !important; }
  .fixed, .sticky, [style*="position: sticky"], [style*="position: fixed"] { position: static !important; }
  .no-print { display: none !important; }
}

/* Hide on screen only inside the main app, not in the special print window */
@media screen {
  body:not(.print-host) 
  .print-sheet { display: none !important; }
}

/* Scope print to only the active sheet and avoid blank extra pages */
@media print {
  body * { visibility: hidden !important; }
  .print-sheet { display: block; }
  .print-sheet.active,
  .print-sheet.active * { visibility: visible !important; }
  .print-sheet:not(.active) { display: none !important; }
  .print-sheet.active { position: absolute; inset: 0; width: 100%; }
  .post-a4 { display: block !important; min-height: auto !important; height: auto !important; }

  /* Keep large blocks together */
  .bill-wrap, .bill-box, .hdr-grid, .id-grid, .totals, .tandc, .sign-row { break-inside: avoid; page-break-inside: avoid; }
  .tbl { page-break-inside: auto; }
  .tbl thead { display: table-header-group; }
  .tbl tr { page-break-inside: avoid; }
}

/* =========================
   COMPONENT STYLES
   ========================= */
.doc-title {
  display: block;
  width: max-content;
  margin: 4mm auto 0;
  text-align: center;
  font-size: 20pt;
  font-weight: 700;
  letter-spacing: 0.8px;
}

/* Provide inner page padding instead of @page margins (more consistent on Android) */
.post-a4 { display: block; }
.bill-wrap { padding: 8mm; color: #000; }
.bill-box { border: 1px solid #000; border-radius: 1mm; padding: 3mm; }

.hdr-grid { display: grid; grid-template-columns: 28mm 1fr 28mm; align-items: center; gap: 3mm; }
.shop-title { text-align: center; }
.shop-title .en { font-size: 18pt; font-weight: 500; line-height: 1.05; }
.shop-sub { font-size: 10pt; margin-top: 1mm; }

.id-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-top: 3mm; }
.label { font-weight: 600; }

.tbl { width: 100%; border-collapse: collapse; margin-top: 3mm; }
.tbl th, .tbl td { border: 1px solid #111; padding: 1.8mm; font-size: 11pt; }
.tbl th { font-weight: 700; text-align: center; }
.right { text-align: right; }
.center { text-align: center; }
.tiny { font-size: 10px; }

  .totals { display: grid; grid-template-columns: 1fr 70mm; gap: 3mm; margin-top: 4mm; }
  /* Compact single box for all totals */
  .sum-box { border: 1px solid #111; border-radius: 2mm; overflow: hidden; }
  .sum-row { display: grid; grid-template-columns: 1fr 1fr; align-items: center; }
  .sum-row > div { padding: 2mm 2.5mm; font-size: 11pt; line-height: 1.25; }
  .sum-row .label { font-weight: 600; border-right: 1px solid #111; }
  .sum-row + .sum-row { border-top: 1px solid #111; }
  .sum-row .value { text-align: right; }
  .sum-row.emph > div { font-weight: 700; }

.tandc { margin-top: 4mm; }
.tandc-title { font-weight: 700; margin-bottom: 2mm; }
.tandc ol { margin: 0; padding-left: 4mm; }

.sign-row { display: grid; grid-template-columns: 1fr 40mm; margin-top: 8mm; gap: 3mm; align-items: end; }
.sign-box { text-align: center; border-top: 1px solid #111; padding-top: 2mm; }
      `}),i.jsxs("div",{className:"post-a4",children:[i.jsx("div",{className:"doc-title",children:"SERVICE INVOICE"}),i.jsx("div",{className:"bill-wrap",children:i.jsxs("div",{className:"bill-box",children:[i.jsxs("div",{className:"hdr-grid",children:[i.jsx("img",{src:h?"/honda-logo.png":"/shantha-logoprint.jpg",alt:h?"NH Motors":"Shantha Motors",style:{width:"100%",maxHeight:100}}),i.jsx("div",{className:"shop-title",children:h?i.jsxs(i.Fragment,{children:[i.jsx("div",{className:"en",children:"NH Motors | ಎನ್ ಎಚ್ ಮೋಟರ್ಸ್"}),i.jsxs("div",{className:"shop-sub",style:{marginTop:4},children:["Site No. 116/1, Bydarahalli, Magadi Main Road, Opp.",i.jsx("br",{}),"HP Petrol Bunk, Bangalore - 560091"]}),i.jsx("div",{className:"shop-sub",children:"Mob: 9731366921 / 8073283502 / 9741609799"})]}):i.jsxs(i.Fragment,{children:[i.jsx("div",{className:"en",children:"SHANTHA MOTORS | ಶಾಂತ ಮೋಟರ್ಸ್"}),i.jsx("div",{className:"shop-sub",children:"Multi Brand Two Wheeler Sales & Service"}),i.jsx("div",{className:"shop-sub",children:"Mob No : 9731366921 / 8073283502 "}),i.jsx("div",{className:"tiny",children:"Kadabagere • Muddinapalya  • Andrahalli • Tavarekere • Hegganahalli • Channenahalli • Nelagadrahalli"})]})}),i.jsxs("div",{children:[i.jsx("img",{src:"/location-qr.png",alt:"Location QR",style:{width:"100%",maxHeight:100}}),i.jsx("div",{style:{fontSize:13,fontWeight:600,marginTop:4},children:"Scan for Location"})]})]}),i.jsxs("div",{className:"id-grid",children:[i.jsxs("div",{children:[i.jsx("span",{className:"label",children:"Bill To (Customer):"})," ",a?.custName||"-"]}),i.jsxs("div",{children:[i.jsx("span",{className:"label",children:"Invoice No:"})," ",a?.jcNo||"-"]}),i.jsxs("div",{children:[i.jsx("span",{className:"label",children:"Vehicle No:"})," ",a?.regNo||"-",m?`(${m})`:""]}),i.jsxs("div",{children:[i.jsx("span",{className:"label",children:"Date:"})," ",Ue(a?.createdAt)]}),i.jsxs("div",{children:[i.jsx("span",{className:"label",children:"Odometer Reading:"})," ",N!=null?`${N} KM`:"-"]}),i.jsxs("div",{children:[i.jsx("span",{className:"label",children:"Next Service:"})," ",C!=null?`${C} KM`:"-"]})]}),i.jsxs("table",{className:"tbl",children:[i.jsx("thead",{children:i.jsxs("tr",{children:[i.jsx("th",{style:{width:"8mm"},children:"S/N"}),i.jsx("th",{children:"Particulars"}),i.jsx("th",{style:{width:"20mm"},children:"Qty"}),i.jsx("th",{style:{width:"28mm"},children:"Price"}),i.jsx("th",{style:{width:"30mm"},children:"Amount"})]})}),i.jsx("tbody",{children:o.length===0?i.jsx("tr",{children:i.jsx("td",{colSpan:5,className:"center",children:"No items"})}):o.map(d=>i.jsxs("tr",{children:[i.jsx("td",{className:"center",children:d.sn}),i.jsx("td",{children:d.particulars}),i.jsx("td",{className:"center",children:d.qty}),i.jsx("td",{className:"right",children:V(d.rate)}),i.jsx("td",{className:"right",children:V(d.amount)})]},d.sn))})]}),i.jsxs("div",{className:"totals",children:[i.jsxs("div",{className:"bill-to",children:[i.jsx("div",{children:i.jsx("span",{className:"label",children:"Invoice Amount (in words):"})}),i.jsx("div",{style:{border:"1px solid #111",borderRadius:"2mm",padding:"3mm",minHeight:18},children:y})]}),i.jsxs("div",{className:"sum-box",children:[(c>0||u>0)&&i.jsxs("div",{className:"sum-row",children:[i.jsx("div",{className:"label",children:"Labour Subtotal"}),i.jsx("div",{className:"value",children:V(x)})]}),c>0&&i.jsxs("div",{className:"sum-row",children:[i.jsxs("div",{className:"label",children:["GST ",p?`(${p}% on Labour)`:"(on Labour)"]}),i.jsx("div",{className:"value",children:V(c)})]}),u>0&&i.jsxs("div",{className:"sum-row",children:[i.jsx("div",{className:"label",children:"Discount"}),i.jsx("div",{className:"value",children:V(u)})]}),i.jsxs("div",{className:"sum-row emph",children:[i.jsx("div",{className:"label",children:"Grand Total"}),i.jsx("div",{className:"value",children:V(w)})]})]})]}),i.jsxs("div",{className:"tandc",children:[i.jsx("div",{className:"tandc-title",children:"Terms & Conditions"}),i.jsxs("ol",{children:[i.jsx("li",{children:"All services/parts once billed are non-returnable."}),i.jsx("li",{children:"Vehicle will be delivered against full and final payment only."}),i.jsx("li",{children:"Company is not responsible for loss/damage to valuables left in vehicle."}),i.jsx("li",{children:"Kindly verify items and amounts before making payment."}),i.jsx("li",{children:"Vehicle left unclaimed beyond 7 days may attract parking charges."}),i.jsx("li",{children:"Any damages must be reported at the time of delivery."})]})]}),i.jsxs("div",{className:"sign-row",children:[i.jsx("div",{}),i.jsxs("div",{className:"sign-box tiny",children:[h?"For NH Motors":"For Shantha Motors",i.jsx("br",{}),"Authorised Signatory"]})]}),i.jsxs("div",{className:"center tiny",style:{marginTop:6},children:[i.jsx("div",{style:{fontWeight:700,fontSize:16},children:"Thank you for your business — please visit again."}),i.jsx("div",{children:"Ride Smooth. Ride Safe."})]})]})})]})]})});export{nt as P,tt as S,Ue as f,at as h,V as i,it as t};
