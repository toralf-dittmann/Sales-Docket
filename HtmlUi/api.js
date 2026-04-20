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
    listOriginalSheets: function() {
      return requestGet('listOriginalSheets').then(function(data) {
        return data.originalSheets || [];
      });
    },
    listCustomers: function() {
      return requestGet('listCustomers').then(function(data) {
        return data.customers || [];
      });
    },
    getCustomerByName: function(name) {
      return requestGet('customerByName', { name: name });
    },
    ensureStorage: function() {
      return requestPost('ensureStorage');
    },
    listDockets: function(status) {
      return requestGet('listDockets', { status: status || '' }).then(function(data) {
        return data.dockets || [];
      });
    },
    loadDocket: function(docketId) {
      return requestGet('loadDocket', { docketId: docketId });
    },
    createDocket: function(payload) {
      return requestPost('createDocket', {
        payloadJson: JSON.stringify(payload || {})
      });
    },
    createCustomer: function(customer) {
      return requestPost('createCustomer', {
        customerJson: JSON.stringify(customer || {})
      });
    },
    saveDocketHeader: function(docketId, header) {
      return requestPost('saveDocketHeader', {
        docketId: docketId,
        headerJson: JSON.stringify(header || {})
      });
    },
    addDocketLine: function(docketId, line) {
      return requestPost('addDocketLine', {
        docketId: docketId,
        lineJson: JSON.stringify(line || {})
      });
    },
    updateDocketLine: function(docketId, lineId, patch) {
      return requestPost('updateDocketLine', {
        docketId: docketId,
        lineId: lineId,
        patchJson: JSON.stringify(patch || {})
      });
    },
    deleteDocketLine: function(docketId, lineId) {
      return requestPost('deleteDocketLine', {
        docketId: docketId,
        lineId: lineId
      });
    },
    bookDocket: function(docketId) {
      return requestPost('bookDocket', { docketId: docketId });
    },
    saveQuotation: function(docketId) {
      return requestPost('saveQuotation', { docketId: docketId });
    },
    restoreQuotation: function(targetDocketId, quotationDocketId) {
      return requestPost('restoreQuotation', {
        targetDocketId: targetDocketId,
        quotationDocketId: quotationDocketId
      });
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
