
(function () {

    function initializeProjectDatePickers() {

        if (typeof flatpickr === 'undefined') return;

        document.querySelectorAll('.project-date-picker').forEach(input => {

            // Prevent duplicate initialization
            if (input._flatpickr) return;

            flatpickr(input, {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'd/m/Y',
                altInputClass: 'form-control',
                allowInput: false,
                disableMobile: true,
                clickOpens: true
            });

        });
    }

    // Initialize calendar fields on page load
    document.addEventListener(
        'DOMContentLoaded',
        initializeProjectDatePickers
    );

    // Initialize calendar fields added through HTMX
    const observer = new MutationObserver(initializeProjectDatePickers);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    initializeProjectDatePickers();

})();
