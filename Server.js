const express = require('express');
require('dotenv').config();
const callRouter = require('./routes/call');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/', callRouter);

app.listen(5000, () => console.log('Server running on port number 5000'));
