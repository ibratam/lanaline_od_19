/**
 * Resolution Form Component
 * Allows user to choose which version to keep.
 */
export class ResolutionForm {
  render(conflictId) {
    return `
      <div class="resolution-form">
        <h4>Resolve Conflict</h4>
        <label>
          <input type="radio" name="resolution-choice" value="local" checked>
          Keep Source Version
        </label>
        <label>
          <input type="radio" name="resolution-choice" value="odoo">
          Keep Target Version
        </label>
        <div class="btn-group">
          <button class="btn btn-primary" id="resolve-submit" data-id="${conflictId}">Resolve</button>
          <button class="btn btn-secondary" id="resolve-apply" data-id="${conflictId}">Apply</button>
        </div>
      </div>
    `;
  }

  getChoice() {
    const selected = document.querySelector('input[name="resolution-choice"]:checked');
    return selected?.value || 'local';
  }
}

export default ResolutionForm;
