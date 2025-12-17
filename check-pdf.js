const pdf = require('pdf-parse');
console.log('Type of export:', typeof pdf);
console.log('Is function?', typeof pdf === 'function');
console.log('Keys:', Object.keys(pdf));
