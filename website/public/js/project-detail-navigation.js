
(function () {
    'use strict';

    const VALID_TABS = [
        'overview',
        'activities',
        'members',
        'materials',
        'orders'
    ];

    function isProjectDetailsPage() {
        return /^\/projects\/[^/]+\/details\/?$/.test(
            window.location.pathname
        );
    }

    // Update browser URL when a project tab is selected
    document.addEventListener('shown.bs.tab', function (event) {

        if (!isProjectDetailsPage()) {
            return;
        }

        const buttonId = event.target.id;

        const match = buttonId.match(
            /^project-(overview|activities|members|materials|orders)-tab$/
        );

        if (!match) {
            return;
        }

        const selectedTab = match[1];

        if (!VALID_TABS.includes(selectedTab)) {
            return;
        }

        const url = new URL(window.location.href);

        url.searchParams.set('tab', selectedTab);

        window.history.replaceState(
            window.history.state,
            '',
            url.pathname + url.search + url.hash
        );
    });

})();
