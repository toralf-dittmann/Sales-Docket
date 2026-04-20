(function() {
  function getConfig() {
    const stored = window.localStorage.getItem('salesDocket.apiBaseUrl') || '';
    const boot = window.SALES_DOCKET_CONFIG || {};
    return {
      apiBaseUrl: stored || boot.apiBaseUrl || ''
    };
  }

  function setApiBaseUrl(url) {
    window.localStorage.setItem('salesDocket.apiBaseUrl', String(url || '').trim());
  }

  async function requestGet(action, params) {
    const config = getConfig();
    if (!config.apiBaseUrl) {
      throw new Error('API base URL is not configured.');
    }

    const url = new URL(config.apiBaseUrl);
    url.searchParams.set('api', '1');
    url.searchParams.set('action', action);

    Object.entries(params || {}).forEach(function(entry) {
      if (entry[1] !== undefined && entry[1] !== null) {
        url.searchParams.set(entry[0], entry[1]);
      }
    });

    const response = await fetch(url.toString(), {
      method: 'GET'
    });

    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || 'Request failed.');
    }
    return payload.data;
  }

  async function requestPost(body) {
    const config = getConfig();
    if (!config.apiBaseUrl) {
      throw new Error('API base URL is not configured.');
    }

    const response = await fetch(config.apiBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    });

    const payload = await response.json();
    if (!payload.ok) {
      throw new Error(payload.error || 'Request failed.');
    }
    return payload.data;
  }

  window.SalesDocketApi = {
    getConfig: getConfig,
    setApiBaseUrl: setApiBaseUrl,
    ping: function() {
      return requestGet('ping');
    },
    bootstrap: function() {
      return requestGet('bootstrap');
    },
    getContext: function(sheetName) {
      return requestGet('context', { sheetName: sheetName });
    },
    searchProducts: function(query) {
      return requestGet('searchProducts', { query: query });
    },
    saveHeader: function(sheetName, header) {
      return requestPost({
        action: 'saveHeader',
        sheetName: sheetName,
        header: header
      });
    },
    insertProductLine: function(sheetName, productNr, quantity) {
      return requestPost({
        action: 'insertProductLine',
        sheetName: sheetName,
        productNr: productNr,
        quantity: quantity
      });
    }
  };
})();
