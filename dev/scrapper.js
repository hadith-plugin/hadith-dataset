/**
 * El-Shamela Scrapper.
 *
 * An ES6 NodeJS script to scrapp El-Shamela books.
 *
 * To run the script, make sure you have nodejs installed and updated so that no
 * problems occur with current used ES6 features.
 *
 * Run this script with the following commands:
 * 		- Install dependencies
 *   		$ npm install
 *
 * 		- Run script
 *   		$ node scrapper.js {bookId} {partId}
 *
 * @param {Number} bookId   Book id that is needed to be scrapped.
 *                          Simply, find it through El-Shamela web site
 *                          from URL:
 *                          http://shamela.ws/browse.php/book-{bookId}/page-{id}
 *
 * @param {Number} partId   Part id to start from.
 *
 * @return A new directory 'source/{bookId}' will be created at same path of the
 * passed directory argument.
 *
 * Categorization Theory:
 * 	 - Scrapped parts are in order and no files missed.
 *   - Any book or chapter has 'hadith' attr with null value.
 *   - A book can be distinguished if its part is followed directly with
 *     a chapter (another part with 'hadith' null value).
 *   - Any book is directly followed by its first chapter.
 *   - No books without chapters.
 *   - Any chapter is considered the last chapter for a certain book if this
 *     chapter is followed by a book.
 *   - If chapter/book is defined at many parts, there is a common att between
 *   	 those parts called 'caption_id' and the first part is considered to be the
 *   	 chapter/book.
 *
 * Note : Sync versions of some methods was used to:
 *  - Minimizes cpu usage. (Even if it runs few times concurrently/Tested)
 *  	(if this file runs many many times concurrently or single time but
 *     serving many requests (a model of server), it will be very important
 *     to implement async versions.)
 */

/* ************************** Require Needed Modules **************************/
const fs = require('fs');
const path = require('path');
const process = require('process');
const request = require('request');
const punycode = require('punycode');

/* ******************************** Preparations ******************************/

// Scrapped directory passed as a command line argument.
const bookId = process.argv[2];
if (!bookId) {
  console.error('Please pass bookId as an argument');
  process.exit(1);
}

const startFrom = process.argv[3] ? process.argv[3] : 1;

const shamelaAPI = 'http://shamela.ws/browse.php/book/get_page';

/* ****************************** Helper Methods ******************************/
/**
 * Create directory if it does not exist.
 *
 * @method createDirIfNotExist
 *
 * @param  {String}   pathRel   Relative path.
 *
 * @return {void}
 */
function createDirIfNotExist(pathRel) {
    // Absolute path for the output directory.
    const target = path.resolve(pathRel);
    if (!fs.existsSync(target)){
        fs.mkdirSync(target);
    }
}

/* ******************************** Processing ********************************/

// Create output directories
// @TODO Allow this string to be passed (optional) as command line arg.
const targetDir = `source/${bookId}`;
const targetDirAbs = path.resolve(targetDir);

// Maintain being nested.
let parentDir = '';
targetDirAbs.split('/').forEach(dir => {
  parentDir += `${dir}/`;
  createDirIfNotExist(parentDir);
});

/**
 * Get every part of a certain book.
 *
 * @method  getBookPart
 *
 * @param  {Number} partId
 *
 * @return {void}
 */
(function getBookPart(partId) {
  const partUrl = `${shamelaAPI}/${bookId}/${partId}`;
  request.get(partUrl, {json: true}, (err, res, body) => {
    if (err) {
      console.error(`Could not get ${partUrl}`, err);
      process.exit(1);
    }

    if (res.statusCode === 200) {
      const partFile = `${targetDirAbs}/${partId}`;

      // Convert body.content from hex to unicode
      body.content = punycode.toUnicode(body.content);
      fs.writeFileSync(partFile, JSON.stringify(body), 'utf8');

      // Get next part!
      getBookPart(++partId);
    }
  });
})(startFrom);
