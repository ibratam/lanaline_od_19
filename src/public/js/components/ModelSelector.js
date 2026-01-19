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
            id="${prefix}-models"
            placeholder="res.partner, product.product"
            disabled
          >
        </div>
        <p class="text-muted">Uncheck to specify a comma-separated list of model names.</p>
      </div>
    `;
  }

  attachHandlers(prefix) {
    const allCheckbox = document.getElementById(`${prefix}-all`);
    const input = document.getElementById(`${prefix}-models`);

    if (!allCheckbox || !input) return;

    allCheckbox.addEventListener('change', () => {
      input.disabled = allCheckbox.checked;
      if (allCheckbox.checked) {
        input.value = '';
      }
    });
  }

  getSelectedModels(prefix) {
    const allCheckbox = document.getElementById(`${prefix}-all`);
    const input = document.getElementById(`${prefix}-models`);

    if (!allCheckbox || !input) {
      return null;
    }

    if (allCheckbox.checked) {
      return null;
    }

    const models = input.value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    return models.length > 0 ? models : null;
  }
}

export default ModelSelector;
