
(function () {
    'use strict';

    const NOTIFICATION_DURATION = 5000;
    const scheduledAlerts = new WeakSet();

    // ========================================================
    // MATERIAL CATALOG SELECTION
    // ========================================================

    document.addEventListener('click', function (event) {

        const button = event.target.closest(
            '.requirement-material-option'
        );

        if (!button) {
            return;
        }

        const form = button.closest('.requirement-form');

        if (!form) {
            return;
        }

        const materialId = button.dataset.materialId;
        const materialName = button.dataset.materialName;
        const materialUnit = button.dataset.materialUnit;

        const idInput = form.querySelector(
            '.requirement-material-id'
        );

        const selectedDisplay = form.querySelector(
            '.requirement-selected-material'
        );

        const catalogResults = form.querySelector(
            '.requirement-catalog-results'
        );

        if (!idInput || !selectedDisplay) {
            return;
        }

        // Store the actual material ID
        idInput.value = materialId;

        // Display the selected material
        selectedDisplay.textContent =
            materialName + ' (' + materialUnit + ')';

        // Clear the catalog suggestions
        if (catalogResults) {
            catalogResults.replaceChildren();
        }

        // Clear the search input
        const searchInput = form.querySelector(
            'input[name="q"]'
        );

        if (searchInput) {
            searchInput.value = '';
        }
    });

    // ========================================================
    // CLOSE ADD / EDIT / HANDOFF FORMS
    // ========================================================

    document.addEventListener('click', function (event) {

        const button = event.target.closest(
            '[data-requirement-close]'
        );

        if (!button) {
            return;
        }

        const addContainer = button.closest(
            '#requirement-form-container'
        );

        if (addContainer) {
            addContainer.replaceChildren();
            return;
        }

        const inlineContainer = button.closest(
            '[id^="requirement-edit-"]'
        );

        if (inlineContainer) {
            inlineContainer.replaceChildren();
        }
    });

    // ========================================================
    // AUTOMATIC NOTIFICATION DISMISSAL
    // ========================================================

    function monitorNotifications() {

        document.querySelectorAll(
            '#requirement-message .alert'
        ).forEach(function (alert) {

            if (scheduledAlerts.has(alert)) {
                return;
            }

            scheduledAlerts.add(alert);

            setTimeout(function () {

                if (alert.isConnected) {
                    alert.remove();
                }

            }, NOTIFICATION_DURATION);
        });
    }

    const observer = new MutationObserver(function () {
        monitorNotifications();
    });

    function initialize() {

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        monitorNotifications();
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initialize
        );
    } else {
        initialize();
    }

    // ========================================================
    // CLOSE ADD FORM AFTER SUCCESSFUL CREATION
    // ========================================================

    document.body.addEventListener(
        'requirement-created',
        function () {

            const container = document.getElementById(
                'requirement-form-container'
            );

            if (container) {
                container.replaceChildren();
            }
        }
    );

    // ========================================================
    // CLEAR NOTIFICATIONS ON PROJECT TAB CHANGE
    // ========================================================

    document.addEventListener(
        'shown.bs.tab',
        function (event) {

            if (!event.target?.id.startsWith('project-')) {
                return;
            }

            const container = document.getElementById(
                'requirement-message'
            );

            if (container) {
                container.replaceChildren();
            }
        }
    );

})();
