(function(){
'use strict';
function initRestockPing(){
  var root=document.querySelector('[data-restockping-root]');
  if(!root)return;
  var submitBtn=root.querySelector('[data-restockping-submit]');
  var emailInput=root.querySelector('input[name="restock_email"]');
  var honeypotInput=root.querySelector('input[name="b_identifier_hp"]');
  var feedback=root.querySelector('.restockping-feedback');

  function updateAvailability(isAvailable){
    var nativeButtons=document.querySelector('.product-form__buttons')||document.querySelector('.shopify-payment-button')||document.querySelector('[data-shopify="payment-button"]');
    if(!isAvailable){
      root.style.display='block';
      if(nativeButtons){
        nativeButtons.dataset.restockpingSuppressed='true';
        nativeButtons.style.display='none';
      }
    }else{
      root.style.display='none';
      if(nativeButtons&&nativeButtons.dataset.restockpingSuppressed==='true'){
        nativeButtons.style.display='';
        delete nativeButtons.dataset.restockpingSuppressed;
      }
    }
  }

  var initialAvailable=window.ShopifyAnalytics?.meta?.selectedVariant?.available??false;
  updateAvailability(initialAvailable);

  var shopDomain=root.dataset.shopDomain||'';
  if(shopDomain){
    fetch('/apps/restockping/subscribe?shop='+encodeURIComponent(shopDomain))
      .then(function(r){return r.json();})
      .then(function(cfg){
        if(cfg&&cfg.buttonText&&submitBtn)submitBtn.textContent=cfg.buttonText;
        if(cfg&&typeof cfg.buttonRadius==='number'&&submitBtn)submitBtn.style.borderRadius=cfg.buttonRadius+'px';
      })
      .catch(function(){});
  }

  function syncVariantData(variant){
    if(!variant)return;
    if(variant.id)root.dataset.selectedVariantId=String(variant.id);
    if(variant.title)root.dataset.selectedVariantTitle=String(variant.title);
    if(variant.price!==undefined)root.dataset.selectedVariantPrice=(Number(variant.price)/100.0).toFixed(2);
    var rawImg=variant.featured_image?.src||variant.image?.src||variant.featured_image||variant.image;
    if(rawImg&&typeof rawImg==='string'){
      var absUrl=rawImg.startsWith('//')?'https:'+rawImg:rawImg;
      root.dataset.productImage=absUrl;
      var imgInput=root.querySelector('input[name="productImageUrl"]');
      if(imgInput)imgInput.value=absUrl;
    }
  }

  document.addEventListener('change',function(e){
    if(e.target.matches('[name="id"]')||e.target.closest('variant-selects, variant-radios')){
      setTimeout(function(){
        var form=document.querySelector('form[action*="/cart/add"]');
        var submitEl=form?form.querySelector('[type="submit"]'):null;
        var isSoldOut=submitEl?submitEl.hasAttribute('disabled'):false;
        updateAvailability(!isSoldOut);
        var variantInput=form?form.querySelector('[name="id"]'):null;
        if(variantInput&&variantInput.value)root.dataset.selectedVariantId=String(variantInput.value);
      },50);
    }
  });

  document.addEventListener('theme:variant:change',function(e){
    if(e.detail&&e.detail.variant){
      updateAvailability(e.detail.variant.available);
      syncVariantData(e.detail.variant);
    }
  });

  if(submitBtn){
    submitBtn.addEventListener('click',async function(){
      if(honeypotInput&&honeypotInput.value)return;
      var email=emailInput?emailInput.value.trim():'';
      if(!email||!email.includes('@')){
        showFeedback('Please enter a valid email address.','#e11d48');
        return;
      }
      submitBtn.disabled=true;
      submitBtn.style.opacity='0.6';
      try{
        var res=await fetch('/apps/restockping/subscribe',{
          method:'POST',
          headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({
            email:email,
            productId:root.dataset.productId||'',
            productTitle:root.dataset.productTitle||'',
            productImageUrl:(root.querySelector('input[name="productImageUrl"]')?.value)||root.dataset.productImage||'',
            variantId:root.dataset.selectedVariantId||'',
            variantTitle:root.dataset.selectedVariantTitle||'',
            price:root.dataset.selectedVariantPrice||'0.0',
            shop:root.dataset.shopDomain||''
          })
        });
        var data=await res.json();
        if(data.success){
          showFeedback(data.message||"You're on the list! We'll notify you the moment it restocks.",'#059669');
          if(emailInput)emailInput.value='';
        }else{
          showFeedback(data.error||'Could not register request. Try again.','#e11d48');
        }
      }catch(err){
        showFeedback('Network error. Please try again later.','#e11d48');
      }finally{
        submitBtn.disabled=false;
        submitBtn.style.opacity='1';
      }
    });
  }

  function showFeedback(text,color){
    if(!feedback)return;
    feedback.textContent=text;
    feedback.style.color=color;
    feedback.style.display='block';
  }
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',initRestockPing);
}else{
  initRestockPing();
}
})();
