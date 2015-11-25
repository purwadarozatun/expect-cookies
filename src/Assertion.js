var signature = require('cookie-signature');
var should = require('should');

/**
 * Build Assertion function
 *
 * {object|object[]} expects cookies
 * {string} expects.<name> and value of cookie
 * {object} expects.options
 * {string} [expects.options.domain]
 * {string} [expects.options.path]
 * {string} [expects.options.expires] UTC string using date.toUTCString()
 * {number} [expects.options.max-age]
 * {boolean} [expects.options.secure]
 * {boolean} [expects.options.httponly]
 * {string|string[]} [expects.options.secret]
 *
 * @param {function|function[]} [asserts]
 * @returns {Assertion}
 */
module.exports = function(asserts) {
  var assertions = [];

  if (Array.isArray(asserts)) assertions = asserts;
  else if ('function' === typeof asserts) assertions.push(asserts);


  /**
   * Assertion function with static chainable methods
   *
   * @param {object} res
   * @returns {undefined|string}
   * @constructor
   */
  function Assertion(res) {
    if ('object' !== typeof res) throw new Error('res argument must be object');

    // request and response object initialization
    var request = {
      headers: res.req._headers,
      cookies: []
    };

    var response = {
      headers: res.headers,
      cookies: []
    };

    // build assertions request object
    if (request.headers.cookie) {
      request.headers.cookie.split(/; */).forEach(function(cookie) {
        request.cookies.push(Assertion.parse(cookie));
      });
    }

    // build assertions response object
    if (Array.isArray(response.headers['set-cookie']) && 0 < response.headers['set-cookie'].length) {
      response.headers['set-cookie'].forEach(function(val) {
        response.cookies.push(Assertion.parse(val));
      });
    }

    // run assertions
    var result = undefined;
    assertions.every(function(assertion) {
      return ('string' !== typeof (result = assertion(request, response)));
    });

    return result;
  }


  /**
   * Find cookie in stack/array
   *
   * @param {string} name
   * @param {array} stack
   * @returns {object|undefined} cookie
   */
  Assertion.find = function(name, stack) {
    var cookie;

    stack.every(function(val) {
      if (name !== Object.keys(val)[0]) return true;
      cookie = val;
      return false;
    });

    return cookie;
  };


  /**
   * Parse cookie string
   *
   * @param {string} str
   * @param {object} [options]
   * @param {function} [options.decode] uri
   * @param {undefined|boolean} [options.request] headers
   * @returns {object}
   */
  Assertion.parse = function(str, options) {
    if ('string' !== typeof str) throw new TypeError('argument str must be a string');

    if ('object' !== typeof options) options = {};

    var decode = options.decode || decodeURIComponent;

    var parts = str.split(/; */);

    var cookie = {};

    parts.forEach(function(part, i) {
      if (1 === i) cookie.options = {};
      var cookieRef = (0 === i) ? cookie : cookie.options;

      var equalsIndex = part.indexOf('=');

      // things that don't look like key=value get true flag
      if (equalsIndex < 0) {
        cookieRef[part.trim().toLowerCase()] = true;
        return;
      }

      var key = part.substr(0, equalsIndex).trim().toLowerCase();
      // only assign once
      if ('undefined' !== typeof cookie[key]) return;

      var val = part.substr(++equalsIndex, part.length).trim();
      // quoted values
      if ('"' == val[0]) val = val.slice(1, -1);

      try {
        cookieRef[key] = decode(val);
      } catch (e) {
        cookieRef[key] = val;
      }
    });

    if ('undefined' === typeof cookie.options) cookie.options = {};

    return cookie;
  };


  /**
   * Iterate expects
   *
   * @param {object|object[]} expects
   * @param {function} cb
   */
  Assertion.expects = function(expects, cb) {
    if (!Array.isArray(expects) && 'object' === typeof expects) expects = [expects];

    expects.forEach(function(expect) {
      var secret;

      if ('object' === typeof expect.options) {
        if ('string' === typeof expect.options.secret) secret = [expect.options.secret];
        else if (Array.isArray(expect.options.secret)) secret = expect.options.secret;

        delete expect.options.secret;
      }
      else expect.options = {};

      cb(expect, secret);
    });
  };


  /**
   * Assert cookies and options are set
   *
   * @param {object|object[]} expects cookies
   * @param {undefined|boolean} [assert]
   * @returns {function} Assertion
   */
  Assertion.set = function(expects, assert) {
    if ('undefined' === typeof assert) assert = true;

    Assertion.expects(expects, function(expect, secret) {
      var name = Object.keys(expect)[0];
      var keys = Object.keys(expect.options);

      assertions.push(function(req, res) {
        // get expectation cookie
        var cookie = Assertion.find(name, res.cookies);

        if (assert && !cookie) throw new Error('expected: ' + name + ' cookie to be set');

        if (assert) should(cookie.options).have.properties(keys);
        else if(cookie) should(cookie.options).not.have.properties(keys);
      });
    });

    return Assertion;
  };


  /**
   * Assert cookies has been reset
   *
   * @param {object|object[]} expects cookies
   * @param {undefined|boolean} [assert]
   * @returns {function} Assertion
   */
  Assertion.reset = function(expects, assert) {
    if ('undefined' === typeof assert) assert = true;

    Assertion.expects(expects, function(expect, secret) {
      var name = Object.keys(expect)[0];

      assertions.push(function(req, res) {
        // get sent cookie
        var cookieReq = Assertion.find(name, req.cookies);
        // get expectation cookie
        var cookieRes = Assertion.find(name, res.cookies);

        if (assert && (!cookieReq || !cookieRes)) throw new Error('expected: ' + name + ' cookie to be set');
        else if (!assert && cookieReq && cookieRes) throw new Error('expected: ' + name + ' cookie to be set');
      });
    });

    return Assertion;
  };


  /**
   * Assert cookies is set and new
   *
   * @param {object|object[]} expects cookies
   * @param {undefined|boolean} [assert]
   * @returns {function} Assertion
   */
  Assertion.new = function(expects, assert) {
    if ('undefined' === typeof assert) assert = true;

    Assertion.expects(expects, function(expect, secret) {
      var name = Object.keys(expect)[0];

      assertions.push(function(req, res) {
        // get sent cookie
        var cookieReq = Assertion.find(name, req.cookies);
        // get expectation cookie
        var cookieRes = Assertion.find(name, res.cookies);

        if (assert) {
          if (!cookieRes) throw new Error('expected: ' + name + ' cookie to be set');
          if (cookieReq && cookieRes) throw new Error('expected: ' + name + ' cookie to NOT already be set');
        }
        else if (!cookieReq || !cookieRes) throw new Error('expected: ' + name + ' cookie to be set');
      });
    });

    return Assertion;
  };


  /**
   * Assert cookies expires or max-age has increased
   *
   * @param {object|object[]} expects cookies
   * @param {undefined|boolean} [assert]
   * @returns {function} Assertion
   */
  Assertion.renew = function(expects, assert) {
    if ('undefined' === typeof assert) assert = true;

    Assertion.expects(expects, function(expect, secret) {
      var name = Object.keys(expect)[0];

      var expectExpires = new Date(expect.options.expires);
      var expectMaxAge = parseInt(expect.options['max-age']);

      if (!expectExpires.getTime() && !expectMaxAge) throw new Error('expected: ' + name + ' expects to have expires or max-age option');

      assertions.push(function(req, res) {
        // get sent cookie
        var cookieReq = Assertion.find(name, req.cookies);
        // get expectation cookie
        var cookieRes = Assertion.find(name, res.cookies);

        var cookieMaxAge = (expectMaxAge && cookieRes) ? parseInt(cookieRes.options['max-age']) : undefined;
        var cookieExpires = (expectExpires.getTime() && cookieRes) ? new Date(cookieRes.options.expires) : undefined;

        if (assert) {
          if (!cookieReq || !cookieRes) throw new Error('expected: ' + name + ' cookie to be set');

          if (expectMaxAge && (!cookieMaxAge || cookieMaxAge <= expectMaxAge)) throw new Error('expected: ' + name + ' cookie max-age to be greater than existing value');

          if (expectExpires.getTime() && (!cookieExpires.getTime() || cookieExpires <= expectExpires)) throw new Error('expected: ' + name + ' cookie expires to be greater than existing value');
        } else if (cookieRes) {
          if (expectMaxAge && cookieMaxAge > expectMaxAge) throw new Error('expected: ' + name + ' cookie max-age to be less than or equal to existing value');

          if (expectExpires.getTime() && cookieExpires > expectExpires) throw new Error('expected: ' + name + ' cookie expires to be less than or equal to existing value');
        }
      });
    });

    return Assertion;
  };


  /**
   * Assert cookies contains values
   *
   * @param {object|object[]} expects cookies
   * @param {undefined|boolean} [assert]
   * @returns {function} Assertion
   */
  Assertion.contain = function(expects, assert) {
    if ('undefined' === typeof assert) assert = true;

    Assertion.expects(expects, function(expect, secret) {
      var name = Object.keys(expect)[0];
      var keys = Object.keys(expect.options);

      assertions.push(function(req, res) {
        // get expectation cookie
        var cookie = Assertion.find(name, res.cookies);

        if (!cookie) throw new Error('expected: ' + name + ' cookie to be set');

        // check cookie values are equal
        try {
          if (assert) should(cookie[name]).be.eql(expect[name]);
          else should(cookie[name]).not.be.eql(expect[name]);
        } catch(e) {
          if (secret.length) {
            var value;
            secret.every(function(sec) {
              value = signature.unsign(cookie[name].slice(2), sec);
              return !(value && value === expect[name]);
            });

            if (assert && !value) throw new Error('expected: ' + name + ' value to equal ' + expect[name]);
            else if (!assert && value) throw new Error('expected: ' + name + ' value to NOT equal ' + expect[name]);
          }
          else throw e;
        }

        keys.forEach(function(key) {
          if (assert) should(cookie.options[key]).be.eql(expect.options[key]);
          else should(cookie.options[key]).not.be.eql(expect.options[key]);
        });
      });
    });

    return Assertion;
  };


  /**
   * Assert NOT modifier
   *
   * @param {function} method
   * @param {...*}
   */
  Assertion.not = function(method) {
    var args = [];

    for(var i=1; i<arguments.length; ++i) args.push(arguments[i]);

    args.push(false);

    return Assertion[method].apply(Assertion, args);
  };


  return Assertion;
};