/**
 * El-Shamela Processor.
 *
 * @author     Mahmoud Mouneer <m.m.mouneer@gmail.com>
 * @copyright  Hadith Plugin Organization.
 * @license    https://opensource.org/licenses/MIT   MIT License
 * @version    0.1
 *
 * An ES6 NodeJS script to process El-Shamela scrapped parts and categorize them
 * into books and chapters.
 *
 * To run the script, make sure you have nodejs installed and updated so that no
 * problems occur with current used ES6 features. Also make sure to include
 * 'tashkeel.txt' file with this file at the same directory.
 *
 * Run this script with the following commands:
 * 		- Install dependencies
 *   		$ npm install
 *
 * 		- Run script
 *   		$ node processor.js {bookId} {directory}
 *
 * @param {Number} bookId           Book id that is needed to be scrapped.
 *                                  Simply, find it through El-Shamela web site
 *                                  from URL:
 *                                  http://shamela.ws/browse.php/book-{bookId}
 *
 * @param  {String} directory       directory that has the scrapped files to be
 *                                  processed.
 *
 * @return A new directory 'processed/{directory}' will be created at same path
 * of the passed directory argument.
 *
 * Categorization Theory (Deprecated):
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
 * Categorization Theory now Depends on the navigation bar at every book when
 * you read it online.
 *
 * Note : Sync versions of some methods was used for two reasons:
 *  - The logic depends on the order of files
 *  - It minimizes cpu usage. (Even if it runs few times concurrently/Tested)
 *  	(if this file runs many many times concurrently or single time but
 *     serving many requests (a model of server), it will be very important
 *     to implement async versions.)
 */

/* ************************** Require Needed Modules **************************/
const fs = require('fs');
const path = require('path');
const process = require('process');
const request = require('request');
const jsdom = require('jsdom');

/* ******************************** Preparations ******************************/
const shamelaAPI = 'http://shamela.ws/browse.php';
const bookId = process.argv[2];

// Scrapped directory passed as a command line argument.
const directory = process.argv[3];
if (!directory) {
  console.error('Please pass source direcory as an argument');
  process.exit(1);
}

// Absolute path for the directory.
const directoryAbs = path.resolve(directory);

// Prepare tashkeel regex to inject a noTashkeelContent att inside every part
// to help search in the future
const tashkeelContent = fs.readFileSync(`${__dirname}/tashkeel.txt`, 'utf8');
const tashkeel = tashkeelContent.toString().split('\n').join('');

// Create output directories
const inputSplits = directory.split('/');

// If source directory is passed nested.
const SplitLen = inputSplits.length;
const dirName = SplitLen ? inputSplits[SplitLen-1] : inputSplits;

// @TODO Allow this string to be passed (optional) as command line arg.
const outputDir = `processed/${dirName}`;
const outputDirAbs = path.resolve(outputDir);

// Maintain being nested.
let parentDir = '';
outputDir.split('/').forEach(dir => {
  parentDir += `${dir}/`;
  createDirIfNotExist(parentDir);
});
/* ****************************** Helper Methods ******************************/
/**
 * Read part contents.
 *
 * @method readPart
 *
 * @param  {Number} partNo
 *
 * @return {Object}
 */
function readPart(partNo, output = false) {
  // Absolute path for the file.
  const directory = output ? outputDirAbs : directoryAbs;
  const partPath = `${directory}/${partNo}`;
  const partStr = fs.readFileSync(partPath, 'utf8');
  return JSON.parse(partStr);
}

/**
 * Process part contents.
 *
 * @method processPart
 *
 * @param  {Number} partNo
 *
 * @return {Object}
 */
function processPart(partNo) {
  const partJson = readPart(partNo);

  // Sanitize content from HTML tags and other unwanted strings.
  partJson.content = partJson.content.replace(/<(?:.|\n)*?>| &quot;|\d+ - /gm, ' ');

  // Add a new no-tashkeel-content att for every part.
  const tashkeelRegex = new RegExp(`[${tashkeel}]`, 'gm');
  partJson.noTashkeelContent = partJson.content.replace(tashkeelRegex, '');

  return partJson;
}

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

/**
 * Convert NodeList to Array
 *
 * @method nodeListToArr
 *
 * @param  {NodeList} arrAlike
 * @param  {Object}   window
 *
 * @return {Array}
 */
function nodeListToArr(arrAlike, window) {
  // Error Handling
  if (arrAlike.constructor !== window.NodeList) {
    throw new Error('"nodeListToArr" expects arrAlike parameter to be NodeList');
  }

  return Array.prototype.slice.call(arrAlike);
}

/**
 * Get Chapter and Book related to a givin part.
 *
 * @method getChapterBook
 *
 * @param  {Array}    books
 * @param  {Number}   part
 *
 * @return {Object}
 */
function getChapterBook(books, partNo) {
  partNo = parseInt(partNo);
  let book = null;
  let chapter = null;
  books.some(curBook => {
    if (curBook.page > partNo) {
      return;
    }

    return curBook.chapters.some(curChapter => {
      if (curChapter.page > partNo) {
        return;
      }

      book = curBook;
      chapter = curChapter;
      return true;
    });
  });

  return {book, chapter};
}

/**
 * A callback for Array.prototype.sort() to sort chapters/books desc.
 *
 * @method sortCallback
 *
 * @param  {Object}   a
 * @param  {Object}   b
 *
 * @return {Number}
 */
function sortCallback(a, b) {
  if (parseInt(a.page) < parseInt(b.page)) {
    return 1;
  }

  if (parseInt(a.page) > parseInt(b.page)) {
    return -1;
  }

  return 0;
}

/* ******************************** Processing ********************************/

/**
 * Initialization Categorization.
 *
 * @method initCategorization
 *
 * @param  {Array}   searchReference
 *
 * @return {void}
 */
function initCategorization(searchReference) {
  // Read directory contents.
  return fs.readdir(directoryAbs, (err, files) => {
    if (err) {
      console.error('Could not list the directory.', err);
      process.exit(1);
    }

    // Iterate through all the files in the directory.
    let i = 1;
    for (; i <= files.length; i++) {
      let part = processPart(i);

      // Absolute path for the part.
      const partPath = `${outputDirAbs}/${i}`;

      // Check if part is a hadith. (part.hadith < 0 to cover special case at elbo5ari)
      if (!part.hadith || (part.hadith && part.hadith < 0)) {
        const contents = JSON.stringify(part);
        fs.writeFileSync(partPath, contents, 'utf8');
        continue;
      }

      const partCatInfo = getChapterBook(searchReference, part.id);
      part.book = readPart(partCatInfo.book.page, true);
      part.book.sourceName = partCatInfo.book.name;

      // Handle very special case that chapter and hadith are in the same part
      // happened at Sahih Moslim book
      if (partCatInfo.chapter.page === part.id) {
        let contents = JSON.stringify(part);
        fs.writeFileSync(partPath, contents, 'utf8');
        part.chapter = readPart(partCatInfo.chapter.page, true);
        part.chapter.sourceName = partCatInfo.chapter.name;
        contents = JSON.stringify(part);
        fs.writeFileSync(partPath, contents, 'utf8');
      } else {
        part.chapter = readPart(partCatInfo.chapter.page, true);
        part.chapter.sourceName = partCatInfo.chapter.name;
        const contents = JSON.stringify(part);
        fs.writeFileSync(partPath, contents, 'utf8');
      }
    }
  });
}
// Scrapping book and get categorization searchReference.
request.get(`${shamelaAPI}/book-${bookId}`, (err, res, body) => {
  if (err) {
    console.error(`Could not get book`, err);
    process.exit(1);
  }

  if (res.statusCode === 200) {
    jsdom.env(body, function (err, window) {
      let books = window.document.body.querySelectorAll('.treeview > li');
      books = nodeListToArr(books, window);
      let searchReference = [];
      let i = 0;
      (function processBook(book) {
        if (!book) {
          // End of scrapping navigation bar. Lets sort our searchReference desc
          // to search inside it easily.
          searchReference = searchReference.sort(sortCallback);
          searchReference.forEach(curBook => {
            curBook.chapters = curBook.chapters.sort(sortCallback);
          });

          // Read directory contents.
          return initCategorization(searchReference);
        }

        const info = book.querySelector('a');
        const bookPage = info.href.match(/(\d+)$/)[1];
        const onclick = book.querySelector('span').getAttribute('onclick');
        if (!onclick) {
          // Book without chapters like book introduction
          return processBook(books[++i]);
        }

        const chapterParam = onclick.match(/h\((\d+).*/)[1];
        request.get(`${shamelaAPI}/book/lazytree/${bookId}/${chapterParam}/echo`, {timeout: 150000}, (err, res, body) => {
          if (err) {
            console.error(`Could not get chapters`, err);
            process.exit(1);
          }

          if (res.statusCode === 200) {
            jsdom.env(body, function (err, window) {
              const finalBook = {page: bookPage, name: info.text, chapters: []};
              searchReference.push(finalBook);
              let chapters = window.document.body.querySelectorAll('li > a');
              chapters = nodeListToArr(chapters, window);
              chapters.forEach(chapter => {
                const chapterPage = chapter.href.match(/(\d+)$/)[1];
                finalBook.chapters.push({name: chapter.text, page: chapterPage});
              });
              processBook(books[++i]);
            });
          }
        });
      })(books[i]);
    });
  }
});
