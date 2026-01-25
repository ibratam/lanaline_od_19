/**
 * Model Selector Component
 * Provides optional model filtering for preview/sync actions.
 */
export class ModelSelector {
  render(prefix, label = 'Model Filter') {
    return `
      <div class="model-selector">
        <label class="model-selector-label">${label}</label>
        <div class="model-selector-controls">
          <label>
            <input type="checkbox" id="${prefix}-all" checked>
            Sync all models
          </label>
          <input
            type="text"
            id="${prefix}-search"
            placeholder="Search models"
            class="model-selector-search"
            disabled
          >
        </div>
        <div id="${prefix}-status" class="text-muted">Select a source connection to load models.</div>
        <div id="${prefix}-list" class="model-selector-list"></div>
        <p class="text-muted">Uncheck "Sync all models" to pick specific models.</p>
      </div>
    `;
  }

  attachHandlers(prefix) {
    const allCheckbox = document.getElementById(`${prefix}-all`);
    const searchInput = document.getElementById(`${prefix}-search`);
    const list = document.getElementById(`${prefix}-list`);

    if (!allCheckbox || !searchInput || !list) return;

    allCheckbox.addEventListener('change', () => {
      const checkboxes = list.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(box => {
        box.checked = allCheckbox.checked;
      });
      searchInput.disabled = allCheckbox.checked || checkboxes.length === 0;
      if (allCheckbox.checked) {
        searchInput.value = '';
        this.filterList(list, '');
      }
    });

    list.addEventListener('change', () => {
      const checkboxes = list.querySelectorAll('input[type="checkbox"]');
      const allChecked = Array.from(checkboxes).every(box => box.checked);
      allCheckbox.checked = allChecked;
    });

    searchInput.addEventListener('input', () => {
      this.filterList(list, searchInput.value);
    });
  }

  filterList(list, value) {
    const filter = value.trim().toLowerCase();
    const items = list.querySelectorAll('.model-selector-item');
    items.forEach(item => {
      const text = item.dataset.model || '';
      item.style.display = text.includes(filter) ? '' : 'none';
    });
  }

  getSelectedModels(prefix) {
    const allCheckbox = document.getElementById(`${prefix}-all`);
    const list = document.getElementById(`${prefix}-list`);

    if (!allCheckbox || !list) {
      return null;
    }

    const checkboxes = list.querySelectorAll('input[type="checkbox"]');
    const models = Array.from(checkboxes)
      .filter(box => box.checked)
      .map(box => box.value)
      .filter(Boolean);

    if (allCheckbox.checked) {
      return null;
    }

    return models.length > 0 ? models : null;
  }

  setModels(prefix, models = []) {
    const list = document.getElementById(`${prefix}-list`);
    const status = document.getElementById(`${prefix}-status`);
    const allCheckbox = document.getElementById(`${prefix}-all`);
    const searchInput = document.getElementById(`${prefix}-search`);

    if (!list || !status || !allCheckbox || !searchInput) return;

    if (!Array.isArray(models) || models.length === 0) {
      list.innerHTML = '';
      status.textContent = 'No models available.';
      allCheckbox.checked = true;
      searchInput.disabled = true;
      searchInput.value = '';
      return;
    }

    const sorted = [...models].sort((a, b) => {
      const aName = (a.model || '').toLowerCase();
      const bName = (b.model || '').toLowerCase();
      return aName.localeCompare(bName);
    });

    list.innerHTML = sorted.map(model => `
      <label class="model-selector-item" data-model="${model.model.toLowerCase()}">
        <input type="checkbox" value="${model.model}" checked>
        <span class="model-selector-name">${model.model}</span>
        <span class="model-selector-desc">${model.name || ''}</span>
      </label>
    `).join('');

    status.textContent = '';
    allCheckbox.checked = true;
    searchInput.disabled = false;
    searchInput.value = '';
  }

  setStatus(prefix, message) {
    const status = document.getElementById(`${prefix}-status`);
    const list = document.getElementById(`${prefix}-list`);
    const searchInput = document.getElementById(`${prefix}-search`);
    const allCheckbox = document.getElementById(`${prefix}-all`);

    if (!status || !list || !searchInput || !allCheckbox) return;

    status.textContent = message;
    list.innerHTML = '';
    searchInput.disabled = true;
    searchInput.value = '';
    allCheckbox.checked = true;
  }
}

export default ModelSelector;
