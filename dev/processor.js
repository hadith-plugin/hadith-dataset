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
 *   		$ node processor.js {directory}
 *
 * @param  {String} directory       directory that has the scrapped files to be
 *                                  processed.
 *
 * @return A new directory 'processed/{directory}' will be created at same path
 * of the passed directory argument.
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

/* ******************************** Preparations ******************************/

// Scrapped directory passed as a command line argument.
const directory = process.argv[2];
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
function readPart(partNo) {
  // Absolute path for the file.
  const partPath = `${directoryAbs}/${partNo}`;
  const partStr = fs.readFileSync(partPath, 'utf8');
  const partJson = JSON.parse(partStr);

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

/* ******************************** Processing ********************************/

// Read directory contents.
fs.readdir(directoryAbs, (err, files) => {
  if (err) {
    console.error('Could not list the directory.', err);
    process.exit(1);
  }

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

  // It's Used to cache a part that will be used in the future.
  let nextPart = {};

  // Save current book and chapter to assign them to the hadith parts.
  let book = {};
  let chapter = {};

  // If book/chapter has many definition parts, keep tracking the first part.
  let firstPart = {};

  // Iterate through all the files in the directory.
  let i = 1;
  for (; i <= files.length; i++) {
    // Use nextPart if was cached
    const part = nextPart.id ? nextPart : readPart(i);

    // Make sure that is used next time and only once, so empty it.
    nextPart = {};

    // Absolute path for the part.
    const partPath = `${outputDirAbs}/${i}`;

    // Check if part is a hadith.
    if (part.hadith) {
      part.book = book;
      part.chapter = chapter;
      const contents = JSON.stringify(part);
      fs.writeFileSync(partPath, contents, 'utf8');
      firstPart = {};
      continue;
    }

    const contents = JSON.stringify(part);
    fs.writeFileSync(partPath, contents, 'utf8');

    // cache this part and make use of it in the future.
    nextPart = readPart(i+1);

    // Check if next part is not a hadith.
    if (!nextPart.hadith) {
      if (nextPart.caption_id === part.caption_id) {
        firstPart = part;
      } else {
        // else, this is a book.
        // If it has many definitions take the first tracked, else, this is one
        // part definition book.
        book = firstPart.id ? firstPart : part;
        console.log(`Book: ${book.content}`);
        continue;
      }
    }

    // If it has many definitions take the first tracked, else, this is one
    // part definition chapter.
    chapter = firstPart.id ? firstPart : part;
    console.log(`  - chapter: ${chapter.content}`);
  }
});
