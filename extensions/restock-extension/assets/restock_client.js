/**
 * RestockPing Client Engine (Strictly <4KB Vanilla ES6, Zero-CLS)
 */
(function() {
  'use strict';

  function init() {
    const root = document.querySelector('[data-restockping-root]');
    if (!root) return;

    const form = root.querySelector('.restockping-form');
    const btn = root.querySelector('[data-restockping-submit]');
    const input = root.querySelector('input[name="restock_email"]');
    const hp = root.querySelector('input[name="b_identifier_hp"]');
    const feedback = root.querySelector('.restockping-feedback');

    const shop = root.getAttribute('data-shop-domain') || window.location.hostname;
    const proxy = (root.getAttribute('data-proxy-base') || '/apps/restockping').replace(/\/$/, '');

    let variantId = root.getAttribute('data-selected-variant-id');
    let variantTitle = root.getAttribute('data-selected-variant-title') || 'Default';
    let price = root.getAttribute('data-selected-variant-price') || '0.0';

    function setVisible(show) {
      root.style.display = show ? 'block' : 'none';
      if (feedback) { feedback.style.display = 'none'; feedback.textContent = ''; }
    }

    function showMsg(msg, ok) {
      if (!feedback) return;
      feedback.textContent = msg;
      feedback.style.display = 'block';
      feedback.style.color = ok ? '#15803d' : '#b91c1c';
      feedback.style.background = ok ? '#f0fdf4' : '#fef2f2';
      feedback.style.border = ok ? '1px solid #bbf7d0' : '1px solid #fecaca';
    }

    function onVariant(v) {
      if (!v) return;
      variantId = String(v.id);
      variantTitle = v.title || 'Selected';
      price = v.price ? (v.price / 100).toFixed(2) : '0.0';
      setVisible(v.available === false);
    }

    document.addEventListener('theme:variant:change', e => onVariant(e.detail && e.detail.variant));
    document.addEventListener('variant:change', e => onVariant(e.detail && e.detail.variant));

    document.querySelectorAll('form[action*="/cart/add"] [name="id"], select[name="id"], input[name="id"]').forEach(el => {
      el.addEventListener('change', e => {
        const id = e.target.value;
        if (!id) return;
        variantId = id;
        const variants = window.Shopify && window.Shopify.product && window.Shopify.product.variants;
        if (variants) {
          const match = variants.find(item => String(item.id) === String(id));
          if (match) onVariant(match);
        }
      });
    });

    async function submit() {
      if (!input) return;
      const email = input.value.trim();
      if (!email || !email.includes('@')) {
        showMsg('Please enter a valid email address.', false);
        input.focus();
        return;
      }

      if (hp && hp.value) {
        showMsg("You're on the restock priority list!", true);
        if (form) form.reset();
        return;
      }

      const prevText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Subscribing...';

      try {
        const fd = new FormData();
        fd.append('shop', shop);
        fd.append('email', email);
        fd.append('variantId', variantId);
        fd.append('productId', root.getAttribute('data-product-id') || '');
        fd.append('productTitle', root.getAttribute('data-product-title') || 'Product');
        fd.append('variantTitle', variantTitle);
        fd.append('price', price);
        if (hp && hp.value) fd.append('b_identifier_hp', hp.value);

        const res = await fetch(`${proxy}/subscribe`, { method: 'POST', body: fd });
        const data = await res.json().catch(() => ({ success: false }));

        if (res.ok && data.success) {
          showMsg(data.message || "You're on the restock priority list!", true);
          input.value = '';
          btn.textContent = 'Subscribed ✓';
          setTimeout(() => { btn.disabled = false; btn.textContent = prevText; }, 3000);
        } else {
          showMsg(data.error || 'Failed to save request. Please retry.', false);
          btn.disabled = false;
          btn.textContent = prevText;
        }
      } catch {
        showMsg('Network error. Please try again.', false);
        btn.disabled = false;
        btn.textContent = prevText;
      }
    }

    if (btn) btn.addEventListener('click', submit);
    if (form) form.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
