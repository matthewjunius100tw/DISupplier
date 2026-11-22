
(function () {
    'use strict';

    const NOTIFICATION_DURATION = 5000;
    const scheduledAlerts = new WeakSet();

    // Automatically remove each new notification after 5 seconds.
    function monitorNotifications() {

        document.querySelectorAll(
            '#member-message .alert'
        ).forEach(function (alert) {

            // Prevent scheduling multiple timers for the same alert.
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

    // Monitor changes to the page, including HTMX content swaps.
    const observer = new MutationObserver(function () {
        monitorNotifications();
    });

    // Initialize monitoring after the page loads.
    function initialize() {

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        monitorNotifications();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Close Add Member form after successful creation.
    document.body.addEventListener('member-added', function () {

        const formContainer = document.getElementById(
            'member-form-container'
        );

        if (formContainer) {
            formContainer.replaceChildren();
        }
    });

    // Remove notifications when switching Project Details tabs.
    document.addEventListener('shown.bs.tab', function (event) {

        if (!event.target?.id.startsWith('project-')) {
            return;
        }

        const container = document.getElementById('member-message');

        if (container) {
            container.replaceChildren();
        }
    });

})();
