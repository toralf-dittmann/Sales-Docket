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

  async function parseJsonResponse(response) {
    const text = await response.text();
    let payload = {};

    try {
      payload = JSON.parse(text || '{}');
    } catch (error) {
      throw new Error('The server returned an invalid response.');
    }

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || response.statusText || 'Request failed.');
    }

    return payload.data;
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

    const response = await fetch(url.toString(), { method: 'GET' });
    return parseJsonResponse(response);
  }

  async function requestPost(action, params) {
    const config = getConfig();
    if (!config.apiBaseUrl) {
      throw new Error('API base URL is not configured.');
    }

    const form = new URLSearchParams();
    form.set('action', action);

    Object.entries(params || {}).forEach(function(entry) {
      if (entry[1] !== undefined && entry[1] !== null) {
        form.set(entry[0], entry[1]);
      }
    });

    const response = await fetch(config.apiBaseUrl, {
      method: 'POST',
      body: form
    });

    return parseJsonResponse(response);
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
      return requestPost('saveHeader', {
        sheetName: sheetName,
        headerJson: JSON.stringify(header || {})
      });
    },
    insertProductLine: function(sheetName, productNr, quantity) {
      return requestPost('insertProductLine', {
        sheetName: sheetName,
        productNr: productNr,
        quantity: quantity
      });
    },
    bootstrapEnvironment: function() {
      return requestPost('bootstrapHtmlUiTestEnvironment');
    }
  };
})();
