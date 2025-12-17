const pdfLib = require('pdf-parse');
console.log('pdfLib keys:', Object.keys(pdfLib));

if (pdfLib.PDFParse) {
    console.log('pdfLib.PDFParse type:', typeof pdfLib.PDFParse);
    try {
        // Try to see if it's a class or function
        console.log('pdfLib.PDFParse prototype:', pdfLib.PDFParse.prototype);
    } catch (e) {}
}

if (pdfLib.default) {
    console.log('pdfLib.default type:', typeof pdfLib.default);
}

// Check if we can verify strict export
console.log('Module exports:', pdfLib);
