const RecursiveIterator = require('recursive-iterator');

/**
 * A simple function to set a value in an object by a path.
 * It should also work for arrays.
 *
 * @param {any} obj
 * @param {Array[any]} path
 * @param {any} value
 */
function setByPath(obj, path, value) {
  const pList = [...path]; // do not modify function parameter
  const lastProp = pList.pop();
  const schema = pList.reduce((acc, prop) => {
    if (!acc[prop]) acc[prop] = {};
    return acc[prop];
  }, obj);
  schema[lastProp] = value;
}

/**
 * This function will clean up the object by returning a copy of the object without the properties
 * that are not needed.
 *
 * It is quite powerful, since you can specify a path to the property (escape the dots with [.]
 * because they are interpreted as regexes!).
 * You can even use a regex that will match the path(s), so that you could remove properties with a certain
 * name regardless of how deeply they are nested, or certain properties in array objects.
 *
 * @param {Array<string>} propertiesToOmitArray
 * @param {Record<string, any>} inputDoc
 */
function cleanupDocument(propertiesToOmitArray, inputDoc) {
  // a new version using RecursiveIterator
  if (Array.isArray(propertiesToOmitArray)) {
    let outputDoc = {};
    for (const { parent, node, key, path, deep } of new RecursiveIterator(inputDoc)) {
      const regExp = new RegExp(propertiesToOmitArray.map((re) => `(${re})`).join('|'));
      if (!regExp.test(path.join('.'))) {
        if (Array.isArray(node)) {
          setByPath(outputDoc, path, []);
        } else if (typeof node === 'object') {
          setByPath(outputDoc, path, {});
        } else {
          setByPath(outputDoc, path, node);
        }
      }
    }
    return outputDoc;
  } else {
    return inputDoc;
  }
}

module.exports = {
  setByPath,
  cleanupDocument,
  // removePropertiesByRegex,
};
