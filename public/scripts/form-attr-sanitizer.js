(() => {
  const INJECTED_ATTR = '__gcruniqueid';
  const FORM_SELECTOR = `input[${INJECTED_ATTR}], select[${INJECTED_ATTR}], textarea[${INJECTED_ATTR}]`;

  const stripAttr = (root) => {
    if (!root || !(root instanceof Element || root instanceof Document)) {
      return;
    }

    if (root instanceof Element && root.hasAttribute(INJECTED_ATTR)) {
      root.removeAttribute(INJECTED_ATTR);
    }

    if ('querySelectorAll' in root) {
      root.querySelectorAll(FORM_SELECTOR).forEach((node) => {
        node.removeAttribute(INJECTED_ATTR);
      });
    }
  };

  const startObserver = () => {
    if (!document.documentElement || typeof MutationObserver === 'undefined') {
      return null;
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.target instanceof Element) {
          if (mutation.target.hasAttribute(INJECTED_ATTR)) {
            mutation.target.removeAttribute(INJECTED_ATTR);
          }
          continue;
        }

        mutation.addedNodes.forEach((node) => {
          stripAttr(node);
        });
      }
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [INJECTED_ATTR],
    });

    return observer;
  };

  stripAttr(document);

  const observer = startObserver();

  const disconnectObserver = () => {
    observer?.disconnect();
  };

  window.addEventListener('pageshow', () => {
    stripAttr(document);
  });

  window.addEventListener('load', () => {
    window.setTimeout(disconnectObserver, 4000);
  }, { once: true });
})();