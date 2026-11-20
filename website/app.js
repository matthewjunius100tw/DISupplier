const express = require('express');

const app = express();

// Configure Handlebars template engine
const { engine } = require('express-handlebars');

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: false,
    partialsDir: 'views'
}));

app.set('view engine', 'hbs');
app.set('views', './views');

// Middleware for processing form data
app.use(express.urlencoded({ extended: true }));

// Serve static files and frontend libraries
app.use(express.static('public'));
app.use(express.static('node_modules/htmx.org/dist'));
app.use(express.static('node_modules/bootstrap/dist/css'));
app.use(express.static('node_modules/bootstrap/dist/js'));
app.use(express.static('node_modules/bootstrap-icons/font'));

// Homepage route
app.get('/', (req, res) => {
    res.render('index', {
        title: 'DISupplier - Procurement Management System'
    });
});

// Start web server
app.listen(80, () => {
    console.log('DISupplier web server listening on port 80!');
});
