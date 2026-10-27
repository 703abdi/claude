// slider placeholders (swap each .pay for an <img> of a student result)
// student wins: add a file to assets/wins/ and a line here
const WINS=[
  ["win-01.jpg","$4,525 profit in one day"],
  ["win-02.jpg","$3,566 profit in one day"],
  ["win-03.jpg","$827 profit in one day"],
  ["win-04.jpg","$3,680 profit month"],
  ["win-05.jpg","$655 profit in one day"],
  ["win-06.jpg","$7,610 profit month"],
  ["win-08.jpg","$988 profit off one trade"],
  ["win-09.jpg","+14.38% in one week"],
  ["win-07.jpg","5 green weeks in a row"]
];
const img=(w,c,k)=>`<img class="${c}" src="assets/wins/${w[0]}" alt="Student win: ${w[1]}" loading="lazy" width="760" height="830">`;
document.getElementById("track").innerHTML=[...WINS,...WINS].map(w=>img(w,"pay")).join("");
document.getElementById("shots").innerHTML=WINS.map(w=>img(w,"shot")).join("");

// views: home / results; "faq" scrolls to the FAQ at the bottom of home
// free guide form: set LEAD_ENDPOINT to your form or CRM webhook (Brevo, GoHighLevel, Typeform, Zapier).
// Until it is set, the form says it is not connected instead of pretending to send.
const LEAD_ENDPOINT="";
const dlg=document.getElementById("guide-dialog");
document.getElementById("guide-open").addEventListener("click",()=>dlg.showModal());
dlg.addEventListener("click",e=>{if(e.target===dlg)dlg.close()});
document.getElementById("leadform").addEventListener("submit",async e=>{
  e.preventDefault();
  const f=e.target,msg=document.getElementById("leadmsg");
  if(!f.name.value.trim()||!/^\S+@\S+\.\S+$/.test(f.email.value)){msg.style.color="var(--gold-d)";msg.textContent="Add your first name and a valid email.";return}
  if(!LEAD_ENDPOINT){msg.style.color="var(--gold-d)";msg.textContent="This form is not connected yet.";return}
  try{
    const r=await fetch(LEAD_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:f.name.value.trim(),email:f.email.value.trim()})});
    if(!r.ok)throw 0;
    msg.style.color="var(--green-d)";msg.textContent="Sent. Check your inbox.";f.reset();
  }catch(_){msg.style.color="var(--gold-d)";msg.textContent="Something went wrong. Please try again."}
});

// video: load the YouTube player on click so the page stays fast
const vsl=document.getElementById("vsl");
function playVsl(){vsl.removeAttribute("role");vsl.removeAttribute("tabindex");vsl.innerHTML='<iframe src="https://www.youtube-nocookie.com/embed/7UiUAxwDPA0?autoplay=1&rel=0&playsinline=1" title="Welcome to Tawakkul Trading" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>'}
vsl.addEventListener("click",playVsl,{once:true});
vsl.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();playVsl()}});
function go(v){
  const view=v==="faq"?"home":v;
  document.querySelectorAll(".view").forEach(x=>x.classList.toggle("on",x.id==="view-"+view));
  if(v==="faq"){document.querySelectorAll(".view.on .reveal").forEach(el=>el.classList.add("in"));document.getElementById("faq").scrollIntoView({behavior:"smooth"})}
  else window.scrollTo({top:0});
  history.replaceState(null,"","#"+v);observe();
}
document.addEventListener("click",e=>{const t=e.target.closest("[data-go]");if(t){e.preventDefault();go(t.dataset.go)}});
if(location.hash==="#results")go("results");

const io=new IntersectionObserver(es=>es.forEach(x=>{if(x.isIntersecting){x.target.classList.add("in");io.unobserve(x.target)}}),{threshold:.12});
function observe(){document.querySelectorAll(".view.on .reveal:not(.in)").forEach(el=>io.observe(el))}
observe();
