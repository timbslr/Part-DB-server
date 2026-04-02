/*
 * This file is part of Part-DB (https://github.com/Part-DB/Part-DB-symfony).
 *
 *  Copyright (C) 2019 - 2022 Jan Böhmer (https://github.com/jbtronics)
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Controller } from "@hotwired/stimulus";

//Styles
import "datatables.net-bs5/css/dataTables.bootstrap5.css";
import "datatables.net-buttons-bs5/css/buttons.bootstrap5.css";
import "datatables.net-fixedheader-bs5/css/fixedHeader.bootstrap5.css";
import "datatables.net-responsive-bs5/css/responsive.bootstrap5.css";
//Use our own styles for the select extension which fit the bootstrap theme better
//import 'datatables.net-select-bs5/css/select.bootstrap5.css';
import "../../../css/components/datatables_select_bs5.css";

//JS
import "datatables.net-bs5";
import "datatables.net-buttons-bs5";
import "datatables.net-buttons/js/buttons.colVis.js";
import "datatables.net-fixedheader-bs5";
import "datatables.net-colreorder-bs5";
import "datatables.net-rowgroup-bs5";
import "datatables.net-responsive-bs5";
import "../../../js/lib/datatables";

//import 'datatables.net-select-bs5';
//Use the local version containing the fix for the select extension
import "../../../js/lib/dataTables.select.mjs";

const EVENT_DT_LOADED = "dt:loaded";

export default class extends Controller {
	static targets = ["dt"];

	static values = {
		stateSaveTag: String,
	};

	/** The datatable instance associated with this controller instance */
	_dt;

	getStateSaveKey() {
		let key = "dt_state_";

		if (this.stateSaveTagValue) {
			//If a tag is provided, use it to store the state
			key += this.stateSaveTagValue;
		} else {
			//Otherwise generate one from the current url
			key += window.location.pathname;
		}

		return key;
	}

	stateSaveCallback(settings, data) {
		localStorage.setItem(this.getStateSaveKey(), JSON.stringify(data));
	}

	stateLoadCallback() {
		const json = localStorage.getItem(this.getStateSaveKey());
		if (json === null || json === undefined) {
			return null;
		}

		const data = JSON.parse(json);

		if (data) {
			//Do not save the start value (current page), as we want to always start at the first page on a page reload
			delete data.start;
			//Reset the data length to the default value by deleting the length property
			delete data.length;

			if (window.location.pathname.endsWith("/parts-by-storage-location")) {
				// Force ordering to group column, override saved order:
				data.order = [[5, "asc"]];
			}
		}

		return data;
	}

	connect() {
		//$($.fn.DataTable.tables()).DataTable().fixedHeader.disable();
		//$($.fn.DataTable.tables()).DataTable().destroy();

		const settings = JSON.parse(this.element.dataset.dtSettings);
		if (!settings) {
			throw new Error("No settings provided for datatable!");
		}

		//Add url info, as the one available in the history is not enough, as Turbo may have not changed it yet
		settings.url = this.element.dataset.dtUrl;

		//set if the parts should be grouped by storage location or displayed normally
		const GROUPING_ENABLED = window.location.pathname.endsWith("/parts-by-storage-location");

		//Add initial_order info to the settings, so that the order on the initial page load is the one saved in the state
		const saved_state = this.stateLoadCallback();
		if (saved_state !== null) {
			const raw_order = saved_state.order;

			settings.initial_order = raw_order.map((order) => {
					//Skip if direction is empty, as this is the default, otherwise datatables server is confused when the order is sent in the request, but the initial order is set to an empty direction
					if (order[1] === '') {
							return null;
					}

					return {
							column: order[0],
							dir: order[1]
					}
			});

			//Remove null values from the initial_order array
			settings.initial_order = settings.initial_order.filter(order => order !== null);
    }

		settings.initial_order = raw_order.map((order) => {
			if (GROUPING_ENABLED) {
				//set ordering column to "storelocation (=5)" with "asc" as the direction
				return {
					column: 5,
					dir: "asc",
				};
			}

			return {
				column: order[0],
				dir: order[1],
			};
		});

		let options = {
			colReorder: true,

			fixedHeader: {
				header: $(window).width() >= 768, //Only enable fixedHeaders on devices with big screen. Fixes scrolling issues on smartphones.
				headerOffset: $("#navbar").outerHeight(),
			},
			buttons: [
				{
					extend: "colvis",
					className: "mr-2 btn-outline-secondary",
					columns: ":not(.no-colvis)",
					text: "<i class='fa fa-cog'></i>",
				},
			],

			rowCallback: this._rowCallback.bind(this),
			stateSave: true,
			stateSaveCallback: this.stateSaveCallback.bind(this),
			stateLoadCallback: this.stateLoadCallback.bind(this),
		};

		let groupingOptions = {
			rowGroup: {
				startRender: function (rows, group) {
					const columnCount = rows.table().columns().count();
					const backgroundColor = "#121416";

					return $("<tr/>")
						.attr({
							style: `all: unset; display: table-row; background-color: ${backgroundColor};`,
							"data-group": group ?? "",
						})
						.append(
							`
								<td class="dt-select no-colvis" style="border: none; background-color: ${backgroundColor}; box-shadow: none;">
									<input aria-label="Select group" class="dt-select-checkbox group-select-checkbox" type="checkbox">
								</td>
								<td 
									colspan=" ${columnCount}"
									style="
										padding: 0.25rem 0.25rem;
										border: none;
										background-color: ${backgroundColor};
										box-shadow: none;
										font-weight: bold;
									"> 
										${group} 
								</td>
							`
						)
						.get(0);
				},
				endRender: null,
				dataSrc: "storelocation",
			},
			ordering: true,
		};

		if (GROUPING_ENABLED) {
			options = { ...options, ...groupingOptions, order: [[5, "asc"]] };
		}

		if (this.isSelectable()) {
			options.select = {
				style: "multi+shift",
				selector: "td.dt-select",
			};
		}

		//@ts-ignore
		const promise = $(this.dtTarget)
			.initDataTables(settings, options)
			//Register error handler
			.catch((err) => {
				console.error("Error initializing datatables: " + err);
			});

		//Fix height of the length selector
		promise.then((dt) => {
			//Draw the rows to make sure the correct status text is displayed ("No matching records found" instead of "Loading...")
			if (dt.data().length === 0) {
				dt.rows().draw();
			}

			//Find all length selectors (select with name dt_length), which are inside a label
			const lengthSelectors = document.querySelectorAll('label select[name="dt_length"]');
			//And remove the surrounding label, while keeping the select with all event handlers
			lengthSelectors.forEach((selector) => {
				selector.parentElement.replaceWith(selector);
			});

			//Find all column visibility buttons (button with buttons-colvis class) and remove the btn-secondary class
			const colVisButtons = document.querySelectorAll("button.buttons-colvis");
			colVisButtons.forEach((button) => {
				button.classList.remove("btn-secondary");
			});
		});

		//Dispatch an event to let others know that the datatables has been loaded
		promise.then((dt) => {
			const event = new CustomEvent(EVENT_DT_LOADED, { bubbles: true });
			this.element.dispatchEvent(event);

			this._dt = dt;
		});

		//Register event handlers
		promise.then((dt) => {
			//Deselect all rows before registering the event handler
			dt.rows().deselect();

			dt.on("select.dt deselect.dt", this._onSelectionChange.bind(this));
		});

		promise.then((dt) => {
			//Recalculate the fixed header offset, as the navbar should be rendered now
			dt.fixedHeader.headerOffset($("#navbar").outerHeight());
		});

		//Allow to further configure the datatable
		promise.then(this._afterLoaded.bind(this));

		// Attach handler for clicking group checkboxes
		promise.then((dt) => {
			$(this.dtTarget).on("click", ".group-select-checkbox", (event) => {
				const checkbox = event.currentTarget;
				const groupName = $(checkbox).closest("tr").data("group");

				const rowsInGroup = dt.rows((idx, data) => {
					return data.storelocation === groupName;
				});

				if (checkbox.checked) {
					rowsInGroup.select();
				} else {
					rowsInGroup.deselect();
				}
			});
		});

		// Update group checkbox indeterminate state when selection changes
		promise.then((dt) => {
			dt.on("select deselect", () => {
				$(".group-select-checkbox").each(function () {
					const $checkbox = $(this);
					const groupName = $checkbox.closest("tr").data("group");
					const rowsInGroup = dt.rows((idx, data) => data.storelocation === groupName);

					const selectedCount = rowsInGroup.nodes().to$().filter(".selected").length;

					if (selectedCount === 0) {
						this.checked = false;
						this.indeterminate = false;
					} else if (selectedCount === rowsInGroup.count()) {
						this.checked = true;
						this.indeterminate = false;
					} else {
						this.checked = false;
						this.indeterminate = true;
					}
				});
			});
		});

		console.debug("Datatables inited.");
	}

	disconnect() {
		//Destroy the datatable element
		this._dt.destroy();
		console.debug("Datatables destroyed.");
	}

	_rowCallback(row, data, index) {
		//Set the row class based on the optional $$rowClass column data, can be used to color the rows

		//Check if we have a level, then change color of this row
		if (data.$$rowClass) {
			$(row).addClass(data.$$rowClass);
		}
	}

	_onSelectionChange(e, dt, items) {
		//Empty by default but can be overridden by child classes
	}

	_afterLoaded(dt) {
		this.updateAmountHeaderWithTotalAmount();
		dt.on("draw", () => {
			this.updateAmountHeaderWithTotalAmount();
		});
	}

	/**
	 * Check if this datatable has selection feature enabled
	 */
	isSelectable() {
		return this.element.dataset.select ?? false;
	}

	invertSelection() {
		//Do nothing if the datatable is not selectable
		if (!this.isSelectable()) {
			return;
		}

		//Invert the selected rows on the datatable
		const selected_rows = this._dt.rows({ selected: true });
		this._dt.rows().select();
		selected_rows.deselect();
	}

	updateAmountHeaderWithTotalAmount() {
		let targetHeader = "Amount"; // Text in the header you want to match

		// Find the column index by matching header text
		let columnIndex = dt
			.columns()
			.header()
			.toArray()
			.findIndex((th) => {
				return th.textContent.trim().startsWith(targetHeader);
			});

		if (columnIndex === -1) {
			//if not found, try the german version
			targetHeader = "Menge";
			columnIndex = dt
				.columns()
				.header()
				.toArray()
				.findIndex((th) => {
					return th.textContent.trim().startsWith(targetHeader);
				});
		}

		if (columnIndex === -1) {
			console.warn(`Column with header "${targetHeader}" not found.`);
			return;
		}

		// Sum all values in the matched column
		const total = dt
			.column(columnIndex, { search: "applied" }) // filtered rows only
			.data()
			.toArray()
			.reduce((sum, val) => (isNaN(parseFloat(val)) ? sum : sum + parseFloat(val)), 0);

		// Update the header
		const headerCell = dt.column(columnIndex).header();
		headerCell.textContent = `${targetHeader} (${total})`;
	}
}
