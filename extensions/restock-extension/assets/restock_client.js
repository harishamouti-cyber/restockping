(function() {
  'use strict';

  function initRestockPing() {
    const root = document.querySelector('[data-restockping-root]');
    if (!root) return;

    const submitBtn = root.querySelector('[data-restockping-submit]');
    const emailInput = root.querySelector('input[name="restock_email"]');
    const honeypotInput = root.querySelector('input[name="b_identifier_hp"]');
    const feedback = root.querySelector('.restockping-feedback');

    function updateAvailability(isAvailable) {
      const nativeButtons = document.querySelector('.product-form__buttons')
        || document.querySelector('.shopify-payment-button')
        || document.querySelector('[data-shopify="payment-button"]');

      if (!isAvailable) {
        root.style.display = 'block';
        if (nativeButtons) {
          nativeButtons.dataset.restockpingSuppressed = "true";
          nativeButtons.style.display = 'none';
        }
      } else {
        root.style.display = 'none';
        if (nativeButtons && nativeButtons.dataset.restockpingSuppressed === "true") {
          nativeButtons.style.display = '';
          delete nativeButtons.dataset.restockpingSuppressed;
        }
      }
    }

    // Check initial variant status
    const initialVariantAvailable = window.ShopifyAnalytics?.meta?.selectedVariant?.available ?? false;
    updateAvailability(initialVariantAvailable);

    // Apply merchant custom button text & corner radius from app settings
    const shopDomain = root.dataset.shopDomain || '';
    if (shopDomain) {
      fetch('/apps/restockping/subscribe?shop=' + encodeURIComponent(shopDomain))
        .then(function(r) { return r.json(); })
        .then(function(cfg) {
          if (cfg && cfg.buttonText && submitBtn) {
            submitBtn.textContent = cfg.buttonText;
          }
          if (cfg && typeof cfg.buttonRadius === 'number' && submitBtn) {
            submitBtn.style.borderRadius = cfg.buttonRadius + 'px';
          }
        })
        .catch(function() {});
    }

    // Listen for Dawn variant changes
    document.addEventListener('change', function(e) {
      if (e.target.matches('[name="id"]') || e.target.closest('variant-selects, variant-radios')) {
        setTimeout(() => {
          const form = document.querySelector('form[action*="/cart/add"]');
          const submitEl = form ? form.querySelector('[type="submit"]') : null;
          const isSoldOut = submitEl ? submitEl.hasAttribute('disabled') : false;
          updateAvailability(!isSoldOut);
        }, 50);
      }
    });

    // Also support theme:variant:change custom events
    document.addEventListener('theme:variant:change', function(e) {
      if (e.detail && e.detail.variant) {
        updateAvailability(e.detail.variant.available);
      }
    });

    // Submit subscriber form
    if (submitBtn) {
      submitBtn.addEventListener('click', async function() {
        if (honeypotInput && honeypotInput.value) return; // Silent honeypot drop
        const email = emailInput ? emailInput.value.trim() : "";
        if (!email || !email.includes('@')) {
          showFeedback("Please enter a valid email address.", "#e11d48");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.6";

        try {
          const res = await fetch('/apps/restockping/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              email: email,
              productId: root.dataset.productId || '',
              productTitle: root.dataset.productTitle || '',
              productImageUrl: root.dataset.productImage || '',
              variantId: root.dataset.selectedVariantId || '',
              variantTitle: root.dataset.selectedVariantTitle || '',
              price: root.dataset.selectedVariantPrice || '0.0',
              shop: root.dataset.shopDomain || ''
            })
          });

          const data = await res.json();
          if (data.success) {
            showFeedback(data.message || "You're on the list! We'll notify you the moment it restocks.", "#059669");
            if (emailInput) emailInput.value = "";
          } else {
            showFeedback(data.error || "Could not register request. Try again.", "#e11d48");
          }
        } catch (err) {
          showFeedback("Network error. Please try again later.", "#e11d48");
        } finally {
          submitBtn.disabled = false;
          submitBtn.style.opacity = "1";
        }
      });
    }

    function showFeedback(text, color) {
      if (!feedback) return;
      feedback.textContent = text;
      feedback.style.color = color;
      feedback.style.display = 'block';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRestockPing);
  } else {
    initRestockPing();
  }
})();
