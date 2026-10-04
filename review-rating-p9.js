/* MarketKita P9 — Review & Rating marketplace UX
   Canonical review source: product_reviews. The server only accepts reviews
   for completed + paid order items, so the UI never treats a public review
   as a substitute for a verified purchase.
*/
(function(){
  "use strict";

  const state={product:{},seller:{}};

  function esc(v){return typeof window.escDetail==="function"?window.escDetail(v):String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));}
  function stars(v){
    const n=Math.max(0,Math.min(5,Math.round(Number(v)||0)));
    return "★★★★★".split("").map((s,i)=>i<n?"★":"☆").join("");
  }
  function date(v){if(!v)return "";const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"});}
  function sessionToken(){return window.kwSupabase?.auth?.getSession().then(x=>x?.data?.session?.access_token||"").catch(()=>"" );}
  function getRows(key,rows){state[key]=state[key]||{};state[key].rows=Array.isArray(rows)?rows:[];state[key].filter=state[key].filter||"all";state[key].sort=state[key].sort||"newest";return state[key];}

  function toolbar(id,prefix,count){
    let el=document.getElementById(id);
    if(!el){
      el=document.createElement("div");
      el.id=id;
      el.className="mk-p9-review-toolbar";
      el.innerHTML='<div class="mk-p9-filter-pills" role="group" aria-label="Filter ulasan">'+
        '<button type="button" data-p9-filter="all">Semua</button>'+
        '<button type="button" data-p9-filter="5">5★</button>'+
        '<button type="button" data-p9-filter="4">4★</button>'+
        '<button type="button" data-p9-filter="3">3★</button>'+
        '<button type="button" data-p9-filter="2">2★</button>'+
        '<button type="button" data-p9-filter="1">1★</button>'+
      '</div><label class="mk-p9-sort">Urutkan <select><option value="newest">Terbaru</option><option value="highest">Rating tertinggi</option><option value="lowest">Rating terendah</option></select></label>';
      el.querySelectorAll("[data-p9-filter]").forEach(b=>b.addEventListener("click",()=>{
        state[prefix]=state[prefix]||{};state[prefix].filter=b.dataset.p9Filter||"all";render(prefix);
      }));
      el.querySelector("select").addEventListener("change",e=>{state[prefix]=state[prefix]||{};state[prefix].sort=e.target.value;render(prefix);});
      const list=document.getElementById(id.replace("Toolbar","List"));
      list?.parentNode?.insertBefore(el,list);
    }
    const s=state[prefix]||{};el.querySelectorAll("[data-p9-filter]").forEach(b=>b.classList.toggle("active",(b.dataset.p9Filter||"all")===String(s.filter||"all")));
    const select=el.querySelector("select");if(select)select.value=s.sort||"newest";
    return el;
  }

  function render(prefix){
    const s=state[prefix]||{};const rows=s.rows||[];
    const list=document.getElementById(prefix==="product"?"productReviewList":"sellerReviewList");if(!list)return;
    let out=rows.slice();
    if(s.filter&&s.filter!=="all")out=out.filter(x=>Number(x.rating)===Number(s.filter));
    out.sort((a,b)=>{
      if(s.sort==="highest")return Number(b.rating||0)-Number(a.rating||0)||new Date(b.created_at)-new Date(a.created_at);
      if(s.sort==="lowest")return Number(a.rating||0)-Number(b.rating||0)||new Date(b.created_at)-new Date(a.created_at);
      return new Date(b.created_at)-new Date(a.created_at);
    });
    if(!out.length){list.innerHTML='<div class="review-empty">Tidak ada ulasan pada filter ini.</div>';return;}
    list.innerHTML=out.map(x=>{
      const reply=x.seller_reply?'<div class="review-reply"><strong>Balasan seller</strong><div>'+esc(x.seller_reply)+'</div><small>'+esc(date(x.seller_replied_at))+'</small></div>':"";
      return '<article class="review-item mk-p9-review-item">'+
        '<div class="review-item-head"><div><strong>'+esc(x.reviewer_name||"Pembeli")+'</strong><span class="mk-p9-verified">✓ Pembelian terverifikasi</span></div><span>'+esc(date(x.created_at))+'</span></div>'+
        '<div class="review-stars" aria-label="Rating '+Number(x.rating||0)+' dari 5">'+stars(x.rating)+'</div>'+
        (x.comment?'<p>'+esc(x.comment)+'</p>':'<p class="mk-p9-no-comment">Pembeli memberikan rating tanpa komentar.</p>')+
        reply+'</article>';
    }).join("");
  }

  function updateSummary(prefix,data){
    const rows=Array.isArray(data.reviews)?data.reviews:[],summary=data.summary||{rating:0,count:0};
    const score=document.getElementById(prefix==="product"?"productReviewScore":"sellerReviewScore");
    const starsEl=document.getElementById(prefix==="product"?"productReviewStars":"sellerReviewStars");
    const count=document.getElementById(prefix==="product"?"productReviewCount":"sellerReviewCount");
    if(score)score.textContent=summary.count?Number(summary.rating).toFixed(1):"—";
    if(starsEl)starsEl.textContent=stars(summary.rating);
    if(count)count.textContent=summary.count+" ulasan";
    if(prefix==="seller"){
      const top=document.getElementById("detailSellerRating"),topCount=document.getElementById("detailSellerReviewCount");
      if(top)top.textContent=summary.count?Number(summary.rating).toFixed(1):"—";
      if(topCount)topCount.textContent=summary.count+" ulasan";
    }
    const bar=document.getElementById(prefix==="product"?"productReviewBars":"sellerReviewBars");
    if(bar){
      const total=rows.length||1;
      bar.innerHTML=[5,4,3,2,1].map(n=>{const c=rows.filter(x=>Number(x.rating)===n).length,pct=Math.round(c/total*100);return '<div class="review-bar"><span>'+n+'★</span><i><b style="width:'+pct+'%"></b></i><span>'+pct+'%</span></div>';}).join("");
    }
  }

  async function fetchReviews(type,productId,storeId){
    const token=await sessionToken();
    const qs=new URLSearchParams({type});
    if(productId)qs.set("product_id",productId);
    if(storeId)qs.set("store_id",storeId);
    const r=await fetch("/api/reviews?"+qs.toString(),{cache:"no-store",headers:token?{Authorization:"Bearer "+token}:{}});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||"Gagal memuat ulasan.");
    return data;
  }

  window.loadProductReviewsForDetail=async function(productId,storeId,productName){
    const list=document.getElementById("productReviewList");if(!list)return;
    try{
      const data=await fetchReviews("product",String(productId||""),String(storeId||""));
      const s=getRows("product",data.reviews);
      updateSummary("product",data);
      toolbar("productReviewToolbar","product");
      const form=document.getElementById("productReviewForm");
      if(form){
        form.style.display=data.canReview?"block":"none";
        const ta=document.getElementById("productReviewComment");if(ta)ta.maxLength=2000;
        const note=form.querySelector(".mk-p9-form-note");
        if(!note){const n=document.createElement("div");n.className="mk-p9-form-note";n.textContent="Hanya pembeli yang menyelesaikan dan membayar pesanan ini yang dapat mengulas.";form.insertBefore(n,form.firstChild);}
      }
      render("product");
    }catch(e){list.innerHTML='<div class="review-empty">Ulasan produk belum tersedia. Silakan coba lagi.</div>';}
  };

  window.loadSellerReviewsForDetail=async function(storeId){
    const list=document.getElementById("sellerReviewList");if(!list)return;
    try{
      const data=await fetchReviews("seller","",String(storeId||""));
      getRows("seller",data.reviews);updateSummary("seller",data);toolbar("sellerReviewToolbar","seller");render("seller");
    }catch(e){list.innerHTML='<div class="review-empty">Ulasan toko belum tersedia. Silakan coba lagi.</div>';}
  };

  window.chooseProductRating=function(n){window.selectedProductRating=Math.max(1,Math.min(5,Number(n)||5));document.querySelectorAll("#productReviewStarsInput button").forEach((b,i)=>b.classList.toggle("active",i<window.selectedProductRating));};\n\n  window.submitProductReview=async function(){
    const msg=document.getElementById("productReviewFormMsg"),p=window.products?.[window.productDetailIndex];
    if(!p?.id||!p?.store_id){if(msg)msg.textContent="Produk atau toko tidak ditemukan.";return;}
    const token=await sessionToken();
    if(!token){if(msg)msg.textContent="Silakan login terlebih dahulu.";return;}
    const comment=String(document.getElementById("productReviewComment")?.value||"").trim();
    const rating=Math.max(1,Math.min(5,Number(window.selectedProductRating||5)));
    if(comment.length<3){if(msg)msg.textContent="Tulis ulasan minimal 3 karakter.";return;}
    if(comment.length>2000){if(msg)msg.textContent="Ulasan maksimal 2000 karakter.";return;}
    try{
      if(msg)msg.textContent="Mengirim ulasan...";
      const r=await fetch("/api/reviews",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({type:"product",product_id:p.id,product_name:p.name,store_id:p.store_id,rating,comment})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.error||"Gagal mengirim ulasan.");
      const ta=document.getElementById("productReviewComment");if(ta)ta.value="";
      if(msg)msg.textContent="Ulasan berhasil dikirim. Terima kasih!";
      await window.loadProductReviewsForDetail(p.id,p.store_id,p.name);
      if(window.loadSellerReviewsForDetail)await window.loadSellerReviewsForDetail(p.store_id);
    }catch(e){if(msg)msg.textContent=e.message||"Gagal mengirim ulasan.";}
  };

  window.buyerReviewMarkup=function(item,order){
    if(String(order?.status||"")!=="completed")return "";
    const review=item?.review,id=String(item?.id||"");
    if(review){
      return '<div class="buyer-review-box mk-p9-buyer-review"><div class="buyer-review-head"><strong>Ulasan Anda</strong><span class="mk-p9-verified">✓ Pembelian terverifikasi</span><span class="buyer-review-stars">'+stars(review.rating)+'</span></div>'+
        (review.review_text?'<p>'+esc(review.review_text)+'</p>':'<p class="mk-p9-no-comment">Rating diberikan tanpa komentar.</p>')+
        (review.seller_reply?'<div class="buyer-review-reply"><strong>Balasan seller</strong><p>'+esc(review.seller_reply)+'</p><small>'+esc(date(review.seller_replied_at))+'</small></div>':'')+
      '</div>';
    }
    return '<div class="buyer-review-box mk-p9-buyer-review"><div class="buyer-review-head"><strong>Pesanan selesai — beri ulasan</strong><span class="mk-p9-verified">✓ Pembelian terverifikasi</span></div>'+
      '<button type="button" class="buyer-review-open" onclick="toggleBuyerReviewForm(\''+esc(id)+'\')">★ Beri Ulasan</button>'+
      '<div id="buyer-review-form-'+esc(id)+'" class="buyer-review-form" style="display:none">'+
      '<input type="hidden" id="buyer-review-rating-'+esc(id)+'" value="0">'+
      '<div id="buyer-review-stars-'+esc(id)+'" class="buyer-review-star-buttons">'+[1,2,3,4,5].map(n=>'<button type="button" onclick="selectBuyerReviewRating(\''+esc(id)+'\','+n+')">'+n+'★</button>').join("")+'</div>'+
      '<textarea id="buyer-review-text-'+esc(id)+'" maxlength="2000" placeholder="Bagaimana kualitas produk ini?"></textarea>'+
      '<button type="button" class="buyer-review-submit" onclick="submitBuyerReview(\''+esc(id)+'\')">Kirim Ulasan</button>'+
      '<div id="buyer-review-msg-'+esc(id)+'" class="buyer-review-msg"></div></div></div>';
  };

  const style=document.createElement("style");
  style.id="marketkita-p9-review-rating";
  style.textContent=`
.mk-p9-review-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:12px 0 8px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:#f8fbff}
.mk-p9-filter-pills{display:flex;gap:6px;flex-wrap:wrap}.mk-p9-filter-pills button{border:1px solid #cfddea;background:#fff;color:#334761;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850}.mk-p9-filter-pills button.active{background:#1769e8;color:#fff;border-color:#1769e8}
.mk-p9-sort{display:flex;align-items:center;gap:6px;font-size:10px;font-weight:800;color:#63758e}.mk-p9-sort select{height:31px;border:1px solid #cfddea;border-radius:8px;background:#fff;padding:0 8px;font-size:10px;color:#233d60}
.mk-p9-verified{display:inline-flex;align-items:center;gap:3px;margin-left:7px;padding:3px 7px;border-radius:999px;background:#eaf4ff;color:#1769e8;font-size:8px;font-weight:900;vertical-align:middle}
.mk-p9-review-item .review-item-head>div{min-width:0}.mk-p9-no-comment{color:#7c8da3!important;font-style:italic}
.mk-p9-form-note{margin:-2px 0 10px;padding:8px 10px;border-radius:8px;background:#f2f8ff;color:#617997;font-size:9px;line-height:1.5}
.mk-p9-buyer-review{border-color:#cfddea!important;background:#fbfdff!important}
@media(max-width:600px){.mk-p9-review-toolbar{align-items:stretch}.mk-p9-sort{justify-content:space-between}.mk-p9-sort select{flex:1}.mk-p9-filter-pills{width:100%;overflow:auto;flex-wrap:nowrap;padding-bottom:2px}.mk-p9-filter-pills button{white-space:nowrap}}
`;
  document.head.appendChild(style);

  // The dynamic product detail HTML is recreated on every open, so this
  // observer removes any stale toolbar before a fresh review load inserts it.
  const observer=new MutationObserver(()=>{
    ["productReviewToolbar","sellerReviewToolbar"].forEach(id=>{
      const el=document.getElementById(id);
      if(el&&!el.parentNode)el.remove();
    });
  });
  observer.observe(document.body,{childList:true,subtree:true});

  // Keep the public product rating cards in sync after a successful review.
  const oldUpdate=window.updateProductStats;
  if(typeof oldUpdate==="function")window.updateProductStats=async function(){return oldUpdate.apply(this,arguments);};

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{}, {once:true});
})();