(function() {
  let activeSheetName = '';
  const FIJI_TIME_ZONE = 'Pacific/Fiji';

  const statusEl = document.getElementById('status');
  const resultsEl = document.getElementById('results');
  const lineItemsEl = document.getElementById('lineItems');
  const emailEl = document.getElementById('email');
  const sheetEl = document.getElementById('sheetName');
  const searchEl = document.getElementById('searchInput');
  const apiBaseUrlEl = document.getElementById('apiBaseUrl');
  const hostingNoticeEl = document.getElementById('hostingNotice');
  const liveAppLinkEl = document.getElementById('liveAppLink');

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function setStatusWithTimestamp(message) {
    statusEl.textContent = message + ' (' + formatFijiDateTime(new Date()) + ')';
  }

  function isGitHubPagesPreview() {
    return /github\.io$/i.test(window.location.hostname);
  }

  function syncLiveAppLink() {
    const apiBaseUrl = window.SalesDocketApi.getConfig().apiBaseUrl;
    if (!hostingNoticeEl || !liveAppLinkEl) {
      return;
    }

    if (apiBaseUrl) {
      liveAppLinkEl.href = apiBaseUrl;
      hostingNoticeEl.hidden = !isGitHubPagesPreview();
      return;
    }

    liveAppLinkEl.removeAttribute('href');
    hostingNoticeEl.hidden = true;
  }

  function fillInput(id, value) {
    document.getElementById(id).value = value || '';
  }

  function fillText(id, value) {
    document.getElementById(id).textContent = value || '-';
  }

  function renderContext(context) {
    activeSheetName = context.sheetName || '';
    fillInput('title', context.title);
    fillInput('docketNumber', context.header.docketNumber);
    fillInput('customerName', context.header.customerName);
    fillInput('customerEmail', context.header.customerEmail);
    fillInput('orderNumber', context.header.orderNumber);
    fillInput('paymentMethod', context.header.paymentMethod);

    lineItemsEl.innerHTML = '';
    if (!context.lineItems.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.className = 'empty';
      td.textContent = 'No line items entered yet.';
      tr.appendChild(td);
      lineItemsEl.appendChild(tr);
    } else {
      context.lineItems.forEach(function(item) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + item.rowNumber + '</td>' +
          '<td>' + escapeHtml(item.productDetail) + '</td>' +
          '<td>' + escapeHtml(item.description) + '</td>' +
          '<td>' + escapeHtml(item.quantity) + '</td>' +
          '<td>' + escapeHtml(item.unitPrice) + '</td>' +
          '<td>' + escapeHtml(item.totalPrice) + '</td>';
        lineItemsEl.appendChild(tr);
      });
    }

    fillText('subtotal', context.totals.subtotal);
    fillText('shipping', context.totals.shipping);
    fillText('vatRate', context.totals.vatRate);
    fillText('vatAmount', context.totals.vatAmount);
    fillText('grandTotal', context.totals.grandTotal);
  }

  function renderResults(products) {
    resultsEl.innerHTML = '';

    if (!products.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'No matching products found.';
      resultsEl.appendChild(div);
      return;
    }

    products.forEach(function(product) {
      const card = document.createElement('div');
      card.className = 'result';

      const top = document.createElement('div');
      top.className = 'result-top';
      top.innerHTML =
        '<div>' +
          '<div class="pn">' + escapeHtml(product.productNr) + '</div>' +
          '<div>' + escapeHtml(product.description || '') + '</div>' +
          '<div class="muted">' + escapeHtml(product.variant || '') + '</div>' +
        '</div>' +
        '<div class="muted">Stock ' + escapeHtml(String(product.stockLevel || 0)) + '</div>';

      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const quantity = document.createElement('input');
      quantity.type = 'number';
      quantity.min = '1';
      quantity.step = '1';
      quantity.value = '1';

      const button = document.createElement('button');
      button.className = 'primary';
      button.type = 'button';
      button.textContent = 'Insert Line';
      button.addEventListener('click', async function() {
        if (!activeSheetName) {
          setStatus('Load a docket first.');
          return;
        }

        try {
          button.disabled = true;
          setStatus('Inserting ' + product.productNr + '...');
          const response = await window.SalesDocketApi.insertProductLine(
            activeSheetName,
            product.productNr,
            quantity.value
          );
          renderContext(response.context);
          setStatus('Inserted ' + product.productNr + ' into row ' + response.rowNumber + '.');
        } catch (error) {
          setStatus('Insert failed: ' + error.message);
        } finally {
          button.disabled = false;
        }
      });

      const price = document.createElement('div');
      price.className = 'muted';
      price.textContent = 'Net ' + formatMoney(product.unitPriceNet);

      actions.appendChild(quantity);
      actions.appendChild(button);
      actions.appendChild(price);

      card.appendChild(top);
      card.appendChild(actions);
      resultsEl.appendChild(card);
    });
  }

  async function loadContext() {
    const selected = sheetEl.value;
    if (!selected) return;

    try {
      setStatus('Loading sales docket context...');
      const data = await window.SalesDocketApi.getContext(selected);
      renderContext(data);
      setStatus('Loaded ' + data.sheetName + '.');
    } catch (error) {
      setStatus('Load failed: ' + error.message);
    }
  }

  async function runSearch() {
    const query = searchEl.value.trim();
    if (!query) {
      resultsEl.innerHTML = '<div class="empty">Type to search products.</div>';
      return;
    }

    try {
      setStatus('Searching products...');
      const data = await window.SalesDocketApi.searchProducts(query);
      renderResults(data.products || []);
      setStatus('Search ready.');
    } catch (error) {
      setStatus('Search failed: ' + error.message);
    }
  }

  async function bootstrap() {
    try {
      apiBaseUrlEl.value = window.SalesDocketApi.getConfig().apiBaseUrl;
      syncLiveAppLink();
      if (!apiBaseUrlEl.value) {
        setStatus('Configure the Apps Script API URL to begin. All displayed times use Fiji time.');
        return;
      }

      if (isGitHubPagesPreview()) {
        setStatus('GitHub Pages preview is static only. Use the live Apps Script web app link above.');
        return;
      }

      const data = await window.SalesDocketApi.bootstrap();
      emailEl.value = data.currentUser.email || 'Unavailable';
      sheetEl.innerHTML = '';

      (data.sheets || []).forEach(function(name) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        sheetEl.appendChild(option);
      });

      if (sheetEl.value) {
        await loadContext();
      } else {
        setStatus('No sales docket sheets found.');
      }
    } catch (error) {
      setStatus('Bootstrap failed: ' + error.message);
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatMoney(value) {
    const numeric = Number(value || 0);
    return numeric.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatFijiDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value || '');
    }

    return new Intl.DateTimeFormat('en-FJ', {
      timeZone: FIJI_TIME_ZONE,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  }

  document.getElementById('saveConfigBtn').addEventListener('click', function() {
    window.SalesDocketApi.setApiBaseUrl(apiBaseUrlEl.value);
    syncLiveAppLink();
    setStatusWithTimestamp('API URL saved locally');
    bootstrap();
  });

  document.getElementById('loadBtn').addEventListener('click', loadContext);

  document.getElementById('pingBtn').addEventListener('click', async function() {
    try {
      setStatus('Pinging server...');
      const data = await window.SalesDocketApi.ping();
      setStatus('Server reachable at ' + formatFijiDateTime(data.at));
    } catch (error) {
      setStatus('Ping failed: ' + error.message);
    }
  });

  document.getElementById('saveHeaderBtn').addEventListener('click', async function() {
    if (!activeSheetName) {
      setStatus('Load a docket first.');
      return;
    }

    try {
      setStatus('Saving header...');
      const response = await window.SalesDocketApi.saveHeader(activeSheetName, {
        customerName: document.getElementById('customerName').value,
        customerEmail: document.getElementById('customerEmail').value,
        orderNumber: document.getElementById('orderNumber').value,
        paymentMethod: document.getElementById('paymentMethod').value
      });
      renderContext(response.context);
      setStatus('Header saved.');
    } catch (error) {
      setStatus('Save failed: ' + error.message);
    }
  });

  let searchTimer = null;
  searchEl.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 180);
  });

  bootstrap();
})();
