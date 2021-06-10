import { LightningElement, track, api } from 'lwc';
import lookup from '@salesforce/apex/LookupController.lookup';
import getCurrentValue from '@salesforce/apex/LookupController.getCurrentValue';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';


const MINIMAL_SEARCH_TERM_LENGTH = 2; // Min number of chars required to search
const SEARCH_DELAY = 300; // Wait 300 ms after user stops typing then, peform search

export default class Lookup extends LightningElement {
  @api label;
  @api placeholder = '';
  @api errors = [];
  @api scrollAfterNItems;
  @api customKey;
  @api sObjectName;
  @api sObjectIcon;

  @track searchTerm = '';
  @track searchResults = [];
  @track hasFocus = false;
  @track loading = false;

  cleanSearchTerm;
  blurTimeout;
  searchThrottlingTimeout;
  curSelection = {}

  connectedCallback() {

  }

  rendered = false;
  renderedCallback() {
    if (this.rendered) {
      return;
    }
    this.rendered = true;
    console.log('initial:' + JSON.stringify(this.curSelection));
    this.getInitialValue();
  }

  // EXPOSED FUNCTIONS
  @api
  set selection(initialSelection) {

    this.curSelection = initialSelection;
    this.getInitialValue();
  }
  get selection() {
    return this.curSelection;
  }

  @api
  setSearchResults(results) {
    // Reset the spinner
    this.loading = false;
    console.log(results);
    this.searchResults = results.map((result) => {
      // Clone and complete search result if icon is missing
      if (typeof result.icon === 'undefined') {
        const { id, sObjectType, title, subtitle } = result;
        return {
          id,
          sObjectType,
          icon: 'standard:default',
          title,
          subtitle
        };
      }
      return result;
    });
  }

  @api
  getSelection() {
    return this.curSelection;
  }

  @api
  getkey() {
    return this.customKey;
  }

  // INTERNAL FUNCTIONS

  getInitialValue() {
    if (!this.curSelection || !this.curSelection.id) {
      return;
    }
    var params = {
      type: this.sObjectName,
      value: this.curSelection.id
    };
    getCurrentValue(params)
      .then((results) => {
        this.curSelection = results;
      })
      .catch((error) => {
        this.handleErrors(error);
      });
  }


  handleErrors = (error) => {
    this.notifyUser('Lookup Error', 'An error occured while searching with the lookup field.', 'error');
    console.error('Lookup error', JSON.stringify(error));
    this.errors = [error];
  }


  notifyUser(title, message, variant) {
    if (this.notifyViaAlerts) {
      // Notify via alert
      // eslint-disable-next-line no-alert
      alert(`${title}\n${message}`);
    } else {
      // Notify via toast
      const toastEvent = new ShowToastEvent({ title, message, variant });
      this.dispatchEvent(toastEvent);
    }
  }

  handleUserSearch(searchTerm, selectedIds) {

    const filter = '';

    lookup({ searchString: searchTerm, sObjectAPIName: this.sObjectName, filter: filter, selectedIds: selectedIds })
      .then((results) => {
        this.setSearchResults(results);
      })
      .catch((error) => {
        this.notifyUser('Lookup Error', 'An error occured while searching with the lookup field.', 'error');
        console.error('Lookup error', JSON.stringify(error));
        this.errors = [error];
      });
  }



  updateSearchTerm(newSearchTerm) {
    this.searchTerm = newSearchTerm;

    // Compare clean new search term with current one and abort if identical
    const newCleanSearchTerm = newSearchTerm.trim().replace(/\*/g, '').toLowerCase();
    if (this.cleanSearchTerm === newCleanSearchTerm) {
      return;
    }

    // Save clean search term
    this.cleanSearchTerm = newCleanSearchTerm;

    // Ignore search terms that are too small
    if (newCleanSearchTerm.length < MINIMAL_SEARCH_TERM_LENGTH) {
      this.searchResults = [];
      return;
    }

    // Apply search throttling (prevents search if user is still typing)
    if (this.searchThrottlingTimeout) {
      clearTimeout(this.searchThrottlingTimeout);
    }
    this.searchThrottlingTimeout = setTimeout(() => {
      // Send search event if search term is long enougth
      if (this.cleanSearchTerm.length >= MINIMAL_SEARCH_TERM_LENGTH) {
        // Display spinner until results are returned
        this.loading = true;
        this.handleUserSearch(this.cleanSearchTerm, [this.curSelection]);

      }
      this.searchThrottlingTimeout = null;
    }, SEARCH_DELAY);
  }

  isSelectionAllowed() {
    return !this.hasSelection();
  }

  hasResults() {
    return this.searchResults.length > 0;
  }

  hasSelection() {
    return (this.curSelection != null && this.curSelection != undefined);
  }

  // EVENT HANDLING

  handleInput(event) {
    // Prevent action if selection is not allowed
    if (!this.isSelectionAllowed()) {
      return;
    }
    this.updateSearchTerm(event.target.value);
  }

  handleResultClick(event) {
    const recordId = event.currentTarget.dataset.recordid;

    // Save selection
    let selectedItem = this.searchResults.filter((result) => result.id === recordId);
    if (selectedItem.length === 0) {
      return;
    }
    this.curSelection = selectedItem[0];

    // Reset search
    this.searchTerm = '';
    this.searchResults = [];

    // Notify parent components that selection has changed
    this.dispatchEvent(new CustomEvent('selectionchange'));
  }

  handleComboboxClick() {
    // Hide combobox immediatly
    if (this.blurTimeout) {
      window.clearTimeout(this.blurTimeout);
    }
    this.hasFocus = false;
  }

  handleFocus() {
    // Prevent action if selection is not allowed
    this.dispatchEvent(new CustomEvent('focus'));
    if (!this.isSelectionAllowed()) {
      return;
    }
    this.hasFocus = true;

  }

  handleBlur() {
    // Prevent action if selection is not allowed
    this.dispatchEvent(new CustomEvent('blur'));
    if (!this.isSelectionAllowed()) {
      return;
    }
    // Delay hiding combobox so that we can capture selected result
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this.blurTimeout = window.setTimeout(() => {
      this.hasFocus = false;
      this.blurTimeout = null;

    }, 300);
  }

  handleClearSelection() {
    this.curSelection = null;
    // Notify parent components that selection has changed
    this.dispatchEvent(new CustomEvent('selectionchange'));
  }

  // STYLE EXPRESSIONS

  get getContainerClass() {
    let css = 'slds-combobox_container slds-has-inline-listbox ';
    if (this.hasFocus && this.hasResults()) {
      css += 'slds-has-input-focus ';
    }
    if (this.errors && this.errors.length > 0) {
      console.log(JSON.stringify(this.errors));
      css += 'has-custom-error';
    }
    return css;
  }

  get getDropdownClass() {
    let css = 'slds-combobox slds-dropdown-trigger slds-dropdown-trigger_click ';
    if (this.hasFocus && this.cleanSearchTerm && this.cleanSearchTerm.length >= MINIMAL_SEARCH_TERM_LENGTH) {
      css += 'slds-is-open';
    }
    return css;
  }

  get getInputClass() {
    let css =
      'slds-input slds-combobox__input has-custom-height ' +
      (!this.errors || this.errors.length === 0 ? '' : 'has-custom-error ');

    css += 'slds-combobox__input-value ' + (this.hasSelection() ? 'has-custom-border' : '');
    return css;
  }

  get getComboboxClass() {
    let css = 'slds-combobox__form-element slds-input-has-icon ';
    css += this.hasSelection() ? 'slds-input-has-icon_left-right' : 'slds-input-has-icon_right';
    return css;
  }

  get getSearchIconClass() {
    let css = 'slds-input__icon slds-input__icon_right ';
    css += this.hasSelection() ? 'slds-hide' : '';
    return css;
  }

  get getClearSelectionButtonClass() {
    return (
      'slds-button slds-button_icon slds-input__icon slds-input__icon_right ' +
      (this.hasSelection() ? '' : 'slds-hide')
    );
  }

  get getSelectIconName() {
    //return this.hasSelection() ? this.curSelection.icon : 'standard:default';
    return this.sObjectIcon ? this.sObjectIcon : 'standard:default';
  }

  get getSelectIconClass() {
    return 'slds-combobox__input-entity-icon ' + (this.hasSelection() ? '' : 'slds-hide');
  }

  get getInputValue() {
    return this.hasSelection() ? this.curSelection.title : this.searchTerm;
  }

  get getInputTitle() {
    return this.hasSelection() ? this.curSelection.title : '';
  }

  get getListboxClass() {
    return (
      'slds-listbox slds-listbox_vertical slds-dropdown slds-dropdown_fluid ' +
      (this.scrollAfterNItems ? 'slds-dropdown_length-with-icon-' + this.scrollAfterNItems : '')
    );
  }

  get isInputReadonly() {
    return this.hasSelection();
  }

  get isExpanded() {
    return this.hasResults();
  }
}