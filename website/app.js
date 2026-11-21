const express = require('express');
const mysql = require('mysql2');
const config = require('./config');


const app = express();

// Configure Handlebars template engine
const {
    engine
} = require('express-handlebars');

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: false,
    partialsDir: 'views'
}));

app.set('view engine', 'hbs');
app.set('views', './views');

// DISupplier MySQL Database Connection
const connection = mysql.createConnection(config.db);

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to DISupplier database:', err.message);
    } else {
        console.log('Successfully connected to DISupplier database!');
    }
});


// Middleware for processing form data
app.use(express.urlencoded({
    extended: true
}));

// Serve static files and frontend libraries
app.use(express.static('public'));
app.use(express.static('node_modules/htmx.org/dist'));
app.use(express.static('node_modules/bootstrap/dist/css'));
app.use(express.static('node_modules/bootstrap/dist/js'));
app.use(express.static('node_modules/bootstrap-icons/font'));

// Homepage route
app.get('/', (req, res) => {
    if (req.get('HX-Request')) {
        res.send(`
            <section class="home-content">
                <h2>Welcome to DISupplier</h2>
                <p>
                    Streamlining construction procurement,
                    material management, and supplier collaboration.
                </p>
                <i class="bi bi-buildings"
                   style="font-size: 70px; color: var(--di-blue);">
                </i>
            </section>
        `);
    } else {
        res.render('index', {
            title: 'DISupplier - Procurement Management System'
        });
    }
});

app.get(/.*/, (req, res, next) => {
    if (req.get('HX-Request')) {
        next();
    } else {
        res.render('index', {
            title: 'DISupplier - Procurement Management System',
            where: req.url
        });
    }
});

const materialCategories = require('./routes/material_categories');

// Share the database connection with the router
materialCategories.connection = connection;

// Register Material Categories routes
app.use('/material-categories', materialCategories);

const materials = require('./routes/materials');

// Share the database connection with the router
materials.connection = connection;

// Register Material List routes
app.use('/materials', materials);


// Start web server
app.listen(80, () => {
    console.log('DISupplier web server listening on port 80!');
});