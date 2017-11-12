// @ts-nocheck
/**
 * @name Sidebar
 * @class L.Control.Sidebar
 * @extends L.Control
 * @param {string} id - The id of the sidebar element (without the # character)
 * @param {Object} [options] - Optional options object
 * @param {string} [options.position=left] - Position of the sidebar: 'left' or 'right'
 * @see L.control.sidebar
 */
L.Control.Sidebar = L.Control.extend(/** @lends L.Control.Sidebar.prototype */ {
    includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,

    options: {
        autopan: false,
        id: '',
        position: 'left'
    },

    /**
     * Create a new sidebar on this object.
     *
     * @constructor
     * @param {Object} [options] - Optional options object
     * @param {string} [options.autopan=false] - whether to move the map when opening the sidebar to make maintain the visible center point
     * @param {string} [options.position=left] - Position of the sidebar: 'left' or 'right'
     * @param {string} [options.id] - ID of a predefined sidebar container that should be used
     */
    initialize: function(options, deprecatedOptions) {
        if (typeof options === 'string') {
            console.warn('this syntax is deprecated. please use L.control.sidebar({ id }) now');
            options = { id: options };
        }

        L.setOptions(this, Object.assign({}, options, deprecatedOptions));
        return this;
    },

    /**
     * Add this sidebar to the specified map.
     *
     * @param {L.Map} map
     * @returns {Sidebar}
     */
    onAdd: function(map) {
        var i, j, child, tabContainers, newContainer, container;

        // Find sidebar HTMLElement via .sidebar, create it if none was found
        container = L.DomUtil.get(this.options.id);
        if (container == null)
            container = L.DomUtil.create('div', 'sidebar collapsed');

        // Find paneContainer in DOM & store reference
        this._paneContainer = container.querySelector('div.sidebar-content');

        // If none is found, create it
        if (this._paneContainer === null)
            this._paneContainer = L.DomUtil.create('div', 'sidebar-content', container);

        // Find tabContainerTop & tabContainerBottom in DOM & store reference
        tabContainers = container.querySelectorAll('ul.sidebar-tabs, div.sidebar-tabs > ul');
        this._tabContainerTop    = tabContainers[0] || null;
        this._tabContainerBottom = tabContainers[1] || null;

        // If no container was found, create it
        if (this._tabContainerTop === null) {
            newContainer = L.DomUtil.create('div', 'sidebar-tabs', container);
            newContainer.setAttribute('role', 'tablist');
            this._tabContainerTop = L.DomUtil.create('ul', '', newContainer);
        }
        if (this._tabContainerBottom === null) {
            newContainer = this._tabContainerTop.parentNode;
            this._tabContainerBottom = L.DomUtil.create('ul', '', newContainer);
        }

        // Store Tabs in Collection for easier iteration
        this._tabitems = [];
        for (i = 0; i < this._tabContainerTop.children.length; i++) {
            child = this._tabContainerTop.children[i];
            child._sidebar = this;
            child._id = child.querySelector('a').hash.slice(1); // FIXME: this could break for links!
            this._tabitems.push(child);
        }
        for (i = 0; i < this._tabContainerBottom.children.length; i++) {
            child = this._tabContainerBottom.children[i];
            child._sidebar = this;
            child._id = child.querySelector('a').hash.slice(1); // FIXME: this could break for links!
            this._tabitems.push(child);
        }

        // Store Panes in Collection for easier iteration
        this._panes = [];
        this._closeButtons = [];
        for (i = 0; i < this._paneContainer.children.length; i++) {
            child = this._paneContainer.children[i];
            if (child.tagName === 'DIV' &&
                L.DomUtil.hasClass(child, 'sidebar-pane')) {
                this._panes.push(child);

                // Save references to close buttons
                var closeButtons = child.querySelectorAll('.sidebar-close');
                for (j = 0, len = closeButtons.length; j < len; j++) {
                    this._closeButtons.push(closeButtons[j]);
                }
            }
        }

        // resetting click listeners for tab & close buttons
        for (i = 0; i < this._tabitems.length; i++) {
            this._tabClick(this._tabitems[i], 'off');
            this._tabClick(this._tabitems[i], 'on');
        }
        for (i = 0; i < this._closeButtons.length; i++) {
            this._closeClick(this._closeButtons[i], 'off');
            this._closeClick(this._closeButtons[i], 'on');
        }

        return container;
    },

    /**
     * Remove this sidebar from the map.
     *
     * @param {L.Map} map
     * @returns {Sidebar}
     */
    onRemove: function (map) {
        var i;

        this._map = null;

        // Remove click listeners for tab & close buttons
        for (i = 0; i < this._tabitems.length - 1; i++)
            this._tabClick(this._tabitems[i], 'off');

        for (i = 0; i < this._closeButtons.length; i++)
            this._closeClick(this._closeButtons[i], 'off');

        return this;
    },

    /**
     * @method addTo(map: Map): this
     * Adds the control to the given map. Overrides the implementation of L.Control,
     * changing the DOM mount target from map._controlContainer.topleft to map._container
     */
    addTo: function (map) {
        this.remove(); // FIXME for leaflet 0.7, removeFrom()??
        this._map = map;

        this._sidebar = this.onAdd(map);

        L.DomUtil.addClass(this._sidebar, 'leaflet-control');
        L.DomUtil.addClass(this._sidebar, 'sidebar-' + this.getPosition());
        if (L.Browser.touch)
            L.DomUtil.addClass(this._sidebar, 'leaflet-touch');

        // when adding to the map container, we should stop event propagation
        L.DomEvent.disableScrollPropagation(this._sidebar);
        L.DomEvent.disableClickPropagation(this._sidebar);

        // insert as first child of map container (important for css)
        map._container.insertBefore(this._sidebar, map._container.firstChild);

        return this;
    },

    /**
     * @deprecated - Please use remove() instead of removeFrom(), as of Leaflet 0.8-dev, the removeFrom() has been replaced with remove()
     * Removes this sidebar from the map.
     * @param {L.Map} map
     * @returns {Sidebar}
     */
     removeFrom: function(map) {
         console.log('removeFrom() has been deprecated, please use remove() instead as support for this function will be ending soon.');
         this.remove(map);
     },

    /**
     * Open sidebar (if it's closed) and show the specified tab.
     *
     * @param {string} id - The ID of the tab to show (without the # character)
     * @returns {L.Control.Sidebar}
     */
    open: function(id) {
        var i, child, tab;

        // If panel is disabled, stop right here
        tab = this._getTab(id);
        if (L.DomUtil.hasClass(tab, 'disabled'))
            return this;

        // Hide old active contents and show new content
        for (i = 0; i < this._panes.length; i++) {
            child = this._panes[i];
            if (child.id === id)
                L.DomUtil.addClass(child, 'active');
            else if (L.DomUtil.hasClass(child, 'active'))
                L.DomUtil.removeClass(child, 'active');
        }

        // Remove old active highlights and set new highlight
        for (i = 0; i < this._tabitems.length; i++) {
            child = this._tabitems[i];
            if (child.querySelector('a').hash === '#' + id)
                L.DomUtil.addClass(child, 'active');
            else if (L.DomUtil.hasClass(child, 'active'))
                L.DomUtil.removeClass(child, 'active');
        }

        this.fire('content', { id: id });

        // Open sidebar if it's closed
        if (L.DomUtil.hasClass(this._sidebar, 'collapsed')) {
            this.fire('opening');
            L.DomUtil.removeClass(this._sidebar, 'collapsed');
            if (this.options.autopan) this._panMap('open');
        }

        return this;
    },

    /**
     * Close the sidebar (if it's open).
     *
     * @returns {L.Control.Sidebar}
     */
    close: function() {
        var i;

        // Remove old active highlights
        for (i = 0; i < this._tabitems.length; i++) {
            var child = this._tabitems[i];
            if (L.DomUtil.hasClass(child, 'active'))
                L.DomUtil.removeClass(child, 'active');
        }

        // close sidebar, if it's opened
        if (!L.DomUtil.hasClass(this._sidebar, 'collapsed')) {
            this.fire('closing');
            L.DomUtil.addClass(this._sidebar, 'collapsed');
            if (this.options.autopan) this._panMap('close');
        }

        return this;
    },

    /**
     * Add a panel to the sidebar
     *
     * @example
     * sidebar.addPanel({
     *     id: 'userinfo',
     *     tab: '<i class="fa fa-gear"></i>',
     *     pane: someDomNode.innerHTML,
     *     position: 'bottom'
     * });
     *
     * @param {Object} [data] contains the data for the new Panel:
     * @param {String} [data.id] the ID for the new Panel, must be unique for the whole page
     * @param {String} [data.position='top'] where the tab will appear:
     *                                       on the top or the bottom of the sidebar. 'top' or 'bottom'
     * @param {HTMLString} {DOMnode} [data.tab]  content of the tab item, as HTMLstring or DOM node
     * @param {HTMLString} {DOMnode} [data.pane] content of the panel, as HTMLstring or DOM node
     * @param {String} [data.link] URL to an (external) link that will be opened instead of a panel
     *
     * @returns {L.Control.Sidebar}
     */
    addPanel: function(data) {
        var i, pane, tab, tabHref, closeButtons;

        // Create tab node
        tab     = L.DomUtil.create('li', '');
        tabHref = L.DomUtil.create('a', '', tab);
        tabHref.href = '#' + data.id;
        tabHref.setAttribute('role', 'tab');
        tabHref.innerHTML = data.tab;
        tab._sidebar = this;
        tab._id = data.id;
        tab._url = data.link; // to allow links to be disabled, the href cannot be used

        // append it to the DOM and store JS references
        if (data.position === 'bottom')
            this._tabContainerBottom.appendChild(tab);
        else
            this._tabContainerTop.appendChild(tab);

        this._tabitems.push(tab);

        // Create pane node
        if (data.pane) {
            if (typeof data.pane === 'string') {
                // pane is given as HTML string
                pane = L.DomUtil.create('DIV', 'sidebar-pane', this._paneContainer);
                pane.innerHTML = data.pane;
            } else {
                // pane is given as DOM object
                pane = data.pane;
                this._paneContainer.appendChild(pane);
            }
            pane.id = data.id;

            this._panes.push(pane);

            // Save references to close buttons & register click listeners
            closeButtons = pane.querySelectorAll('.sidebar-close');
            for (i = 0; i < closeButtons.length; i++) {
                this._closeButtons.push(closeButtons[i]);
                this._closeClick(closeButtons[i], 'on');
            }
        }

        // Register click listeners, if the sidebar is on the map
        this._tabClick(tab, 'on');

        return this;
    },

    /**
     * Removes a panel from the sidebar
     *
     * @example
     * sidebar.remove('userinfo');
     *
     * @param {String} [id] the ID of the panel that is to be removed
     * @returns {L.Control.Sidebar}
     */
    removePanel: function(id) {
        var i, j, tab, pane, closeButtons;

        // find the tab & panel by ID, remove them, and clean up
        for (i = 0; i < this._tabitems.length; i++) {
            if (this._tabitems[i]._id === id) {
                tab = this._tabitems[i];

                // Remove click listeners
                this._tabClick(tab, 'off');

                tab.remove();
                this._tabitems.slice(i, 1);
                break;
            }
        }

        for (i = 0; i < this._panes.length; i++) {
            if (this._panes[i].id === id) {
                pane = this._panes[i];
                closeButtons = pane.querySelectorAll('.sidebar-close');
                // FIXME: broken for loop. close button logic?
                for (j = 0; i < closeButtons.length; i++) {
                    this._closeClick(closeButtons[j], 'off');
                }

                pane.remove();
                this._panes.slice(i, 1);

                break;
            }
        }

        return this;
    },

    /**
     * enables a disabled tab/panel
     *
     * @param {String} [id] ID of the panel to enable
     * @returns {L.Control.Sidebar}
     */
    enablePanel: function(id) {
        var tab = this._getTab(id);
        L.DomUtil.removeClass(tab, 'disabled');

        return this;
    },

    /**
     * disables an enabled tab/panel
     *
     * @param {String} [id] ID of the panel to disable
     * @returns {L.Control.Sidebar}
     */
    disablePanel: function(id) {
        var tab = this._getTab(id);
        L.DomUtil.addClass(tab, 'disabled');

        return this;
    },

    /**
     * (un)registers the onclick event for the given tab,
     * depending on the second argument.
     * @private
     *
     * @param {DOMelement} [tab]
     * @param {String} [on] 'on' or 'off'
     */
    _tabClick: function(tab, on) {
        var link = tab.querySelector('a');
        if (link.hasAttribute('href') && link.getAttribute('href')[0] !== '#')
            return;

        var onTabClick = function() {
            // `this` points to the tab DOM element!
            if (L.DomUtil.hasClass(this, 'active')) {
                this._sidebar.close();
            } else if (!L.DomUtil.hasClass(this, 'disabled')) {
                if (this._url)
                    window.location.href = this._url;
                else
                    this._sidebar.open(this.querySelector('a').hash.slice(1));
            }
        };

        if (on === 'on') {
            L.DomEvent
                .on(tab.querySelector('a'), 'click', L.DomEvent.preventDefault)
                .on(tab.querySelector('a'), 'click', onTabClick, tab);
        } else {
            L.DomEvent.off(tab.querySelector('a'), 'click', onTabClick);
        }
    },

    /**
     * (un)registers the onclick event for the given close button
     * depending on the second argument
     * @private
     *
     * @param {DOMelement} [closeButton]
     * @param {String} [on] 'on' or 'off'
     */
    _closeClick: function(closeButton, on) {

        var onCloseClick = function() {
            this.close();
        };

        if (on === 'on') {
            L.DomEvent.on(closeButton, 'click', onCloseClick, this);
        } else {
            L.DomEvent.off(closeButton, 'click', onCloseClick, this);
        }
    },

    /**
     * Finds & returns the DOMelement of a tab
     *
     * @param {String} [id] the id of the tab
     * @returns {DOMelement} the tab specified by id, null if not found
     */
    _getTab: function(id) {
        for (var i = 0; i < this._tabitems.length; i++) {
            if (this._tabitems[i]._id === id)
                return this._tabitems[i];
        }

        return null;
    },

    /**
     * Helper for autopan: Pans the map for open/close events
     *
     * @param {String} [openClose] The behaviour to enact ('open' | 'close')
     */
   _panMap: function(openClose) {
        var panWidth = Number.parseInt(L.DomUtil.getStyle(this._sidebar, 'max-width')) / 2;
        if (
            openClose === 'open' && this.options.position === 'left' ||
            openClose === 'close' && this.options.position === 'right'
        ) panWidth *= -1;
        this._map.panBy([panWidth, 0], { duration: 0.5 });
   }
});

/**
 * Create a new sidebar.
 *
 * @example
 * var sidebar = L.control.sidebar({ id: 'sidebar' }).addTo(map);
 *
 * @param {Object} [options] - Optional options object
 * @param {string} [options.autopan=false] - whether to move the map when opening the sidebar to make maintain the visible center point
 * @param {string} [options.position=left] - Position of the sidebar: 'left' or 'right'
 * @param {string} [options.id] - ID of a predefined sidebar container that should be used
 * @returns {Sidebar} A new sidebar instance
 */
L.control.sidebar = function(options, deprecated) {
    return new L.Control.Sidebar(options, deprecated);
};
