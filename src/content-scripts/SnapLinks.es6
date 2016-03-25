/*
 * Copyright (c) 2016 Clint Priest
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
 * WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF
 * CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

"use strict";

const CTRL  = 1,
	  ALT   = 2,
	  SHIFT = 4;

//  (MouseEvent.buttons bitfield)
const LMB = 1,	// Left Mouse Button
	  RMB = 2,	// Right Mouse Button
	  MMB = 4;	// Middle Mouse Button


const data = {
	scrollRate: 8,
	selection : {
		activate: {
			minX: 5,
			minY: 5,
		}
	}
};

class Rect {
	constructor(top, left, bottom, right) {
		[ this.originTop, this.originLeft ]              = [ top, left ];
		[ this.top, this.left, this.bottom, this.right ] = [ top, left, bottom, right ];
		this.calculateProperties();
	}

	setBottomRight(bottom, right) {
		[ this.top, this.left ]     = [ Math.min(this.originTop, bottom), Math.min(this.originLeft, right) ];
		[ this.bottom, this.right ] = [ Math.max(this.originTop, bottom), Math.max(this.originLeft, right) ];
		return this.calculateProperties();
	}

	calculateProperties() {
		this.width  = this.right - this.left;
		this.height = this.bottom - this.top;
		return this;
	}

	expand(x, y) {
		[ this.top, this.bottom ] = [ this.top - y, this.bottom + y ];
		[ this.left, this.right ] = [ this.left - x, this.right + x ];
		return this.calculateProperties();
	}

	clipTo(r) {
		[ this.top, this.left ]     = [ Math.max(this.top, r.top), Math.max(this.left, r.left) ];
		[ this.bottom, this.right ] = [ Math.min(this.bottom, r.bottom), Math.min(this.right, r.right) ];
		return this.calculateProperties();
	}

	toString() { return `{ top: ${this.top}, left: ${this.left}, bottom: ${this.bottom}, right: ${this.right}, width: ${this.width}, height: ${this.height} }`; }
}

class DocRect extends Rect {
	constructor(doc) {
		let docElem = document.documentElement;
		super(0, 0, docElem.offsetHeight, docElem.offsetWidth);
	}
}

class SelectionRect {
	constructor(top, left) {
		this.uiElem = CreateElement('<div style="outline: 2px dashed rgba(0,255,0,1); position: absolute; z-index: 9999999;" class="SL_SelRect"></div>');
		this.dims   = new Rect(top, left, top, left);
		document.body.insertBefore(this.uiElem, document.body.firstElementChild);
	}

	setBottomRight(bottom, right) {
		let dr = (new DocRect(document))
			.expand(-2, -2);
		/* Based on current fixed style */
		this.dims
			.setBottomRight(bottom, right)
			.clipTo(dr);

		[ this.uiElem.style.top, this.uiElem.style.left ]     = [ this.dims.top + 'px', this.dims.left + 'px' ];
		[ this.uiElem.style.height, this.uiElem.style.width ] = [ this.dims.height + 'px', this.dims.width + 'px' ];

		this.uiElem.style.display = this.IsLargeEnoughToActivate()
			? ''
			: 'none';
	}

	remove() {
		this.uiElem.remove();
		delete this.uiElem;
	}

	IsLargeEnoughToActivate() {
		return this.dims.width > data.selection.activate.minX && this.dims.height > data.selection.activate.minY;
	}
}

new (class EventHandler {
	constructor() {
		this.RegisterActivationEvents();
		this._onMouseUp          = this.onMouseUp.bind(this);
		this._onMouseMove        = this.onMouseMove.bind(this);
		this._onContextMenu      = this.onContextMenu.bind(this);
		this.StopNextContextMenu = false;
	}

	RegisterActivationEvents() {
		window.addEventListener('mousedown', this.onMouseDown.bind(this), true);
	}

	onMouseDown(e) {
		/* Static use of no-modifiers down and right mouse button down */
		e.mods = (e.ctrlKey) + (e.altKey << 1) + (e.shiftKey << 2);

		if(e.buttons == RMB && e.mods == 0) {
			this.CurrentSelection = new SelectionRect(e.pageY, e.pageX);
			this.LastMouseEvent   = e;
			window.addEventListener('mouseup', this._onMouseUp, true);
			window.addEventListener('mousemove', this._onMouseMove, true);
			window.addEventListener('contextmenu', this._onContextMenu, true);
			this.mmTimer          = setInterval(this.onMouseMoveInterval.bind(this), 30);
			this.EligibleElements = {};
		}
	}

	onMouseMove(e) {
		this.LastMouseEvent = e;
	}

	onMouseMoveInterval() {
		let e       = this.LastMouseEvent,
			docElem = document.documentElement;

		if(e) {
			this.IntervalScrollOffset = {
				x: e.clientX < 0
					? e.clientX
					: e.clientX > docElem.clientWidth
					   ? e.clientX - docElem.clientWidth
					   : 0,
				y: e.clientY < 0
					? e.clientY
					: e.clientY > docElem.clientHeight
					   ? e.clientY - docElem.clientHeight
					   : 0,
			};

			this.MousePos = { clientX: e.clientX, clientY: e.clientY };
			delete this.LastMouseEvent;
		}

		docElem.scrollLeft += this.IntervalScrollOffset.x;
		docElem.scrollTop += this.IntervalScrollOffset.y;

		/* Set our bottom right to scroll + max(clientX/Y, clientWidth/Height) */
		this.CurrentSelection.setBottomRight(docElem.scrollTop + Math.min(this.MousePos.clientY, docElem.clientHeight),
			docElem.scrollLeft + Math.min(this.MousePos.clientX, docElem.clientWidth));
	}

	onMouseUp(e) {
		window.removeEventListener('mouseup', this._onMouseUp, true);

		clearInterval(this.mmTimer);
		delete this.mmTimer;

		window.removeEventListener('mousemove', this._onMouseMove, true);
		this.StopNextContextMenu = this.CurrentSelection.IsLargeEnoughToActivate();
		this.CurrentSelection.remove();
		delete this.CurrentSelection;
	}

	onContextMenu(e) {
		window.removeEventListener('oncontextmenu', this._onContextMenu, true);
		if(this.StopNextContextMenu) {
			this.StopNextContextMenu = false;
			e.preventDefault();
		}
	}
});
