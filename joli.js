var Joli = {
  each: function(collection, iterator, bind) {
    switch (Joli.getType(collection)) {
      case "array":
        for (var i = 0, l = collection.length; i < l; i++) {
          iterator.call(bind, collection[i], i);
        }
        break;
      case "object":
        var test = {};
        for (var property in collection) {
          if (collection[property] !== test[property]) {
            iterator.call(bind, collection[property], property);
          }
        }
        break;
    }
  },

  extend: function(baseClass, options) {
    if (!this.options) {
      this.options = {};
    }

    this.parent = new baseClass(options);

    for (var prop in this.parent) {
      this[prop] = this[prop] || this.parent[prop];
    }

    // copy base options over
    for (var opt in this.parent.options) {
      this.options[opt] = this.options[opt] || this.parent.options[opt];
    }
  },

  getType: function(obj) {
    if (typeof obj === "undefined" || obj === null || (typeof obj === "number" && isNaN(obj))) {
      return false;
    } else if (obj.constructor === Array) {
      return "array";
    } else {
      return typeof obj;
    }
  },

  jsonParse: function(json) {
    return eval('(' + json + ')');
  },

  merge: function() {
    var mergedObject = {};

    for (var i = 0, l = arguments.length; i < l; i++) {
      var object = arguments[i];

      if (Joli.getType(object) !== "object") {
        continue;
      }

      for (var prop in object) {
        var objectProp = object[prop], mergedProp = mergedObject[prop];

        if (mergedProp && Joli.getType(objectProp) === "object" && Joli.getType(mergedProp) === "object") {
          mergedObject[prop] = Joli.merge(mergedProp, objectProp);
        } else {
          mergedObject[prop] = objectProp;
        }
      }
    }
    return mergedObject;
  },

  setOptions: function(options, defaults) {
    if (!options) {
      options = {};
    }

    if (!this.options) {
      this.options = {};
    }

    var mergedOptions = Joli.merge(defaults, options);

    for (var opt in defaults) {
      this.options[opt] = mergedOptions[opt];
    }
  },

  toQueryString: function(obj) {
    var queryStringComponents = [];

    if (!obj) {
      obj = {};
    }

    Joli.each(obj, function(val, key) {
      var result = null;

      switch (Joli.getType(val)) {
        case "object":
          result = Joli.toQueryString(val);
          break;
        case "array":
          result = Joli.toQueryString(val);
          break;
        default:
          result = encodeURIComponent(val);
      }

      if (result) {
        queryStringComponents.push(key + '=' + result);
      }
    });

    return '[' + queryStringComponents.join("&") + ']';
  },

  typeValue: function(val) {
    if (!Joli.getType(val)) {
      return "NULL";
    } else {
      if (Joli.getType(val) === "string") {
        // escape single quotes and dollar signs.
        // quotes are escaped for SQLite
        val = val.replace(/'/g, "''");
        // dollar signs are escaped for use in calling str.replace in JazzRecord.replaceAndClean()
        val = val.replace(/\$/g, "$$$$");
        val = "'" + val + "'";
      } else if (Joli.getType(val) === "boolean") {
        if (val) {
          return 1;
        } else {
          return 0;
        }
      }
    }

    return val;
  }
};


/**
 * Connection
 */
Joli.Connection = function(database) {
  this.dbname = database;
  this.database = Titanium.Database.open(this.dbname);
  this.database.execute('PRAGMA read_uncommitted=true');
};

Joli.Connection.prototype = {
  execute: function(query) {
//    Titanium.API.log('debug', query);
    return this.database.execute(query);
  },

  lastInsertRowId: function() {
    return this.database.lastInsertRowId;
  }
};


/**
 * Migration description
 */
Joli.migration = function(options) {
  var defaults = {
    tableName: 'migration'
  };

  Joli.setOptions.call(this, options, defaults);
  this.table = this.options.tableName;
};

Joli.migration.prototype = {
  getVersion: function() {
    var q = new Joli.query().select().from(this.table).order('version desc');
    var version = q.execute();

    if (version.length > 0) {
      return version[0].version;
    } else {
      q = new Joli.query().insertInto(this.table).values({ version: 0 });
      q.execute();
      return 0;
    }
  },

  setVersion: function(version) {
    var q = new Joli.query().update(this.table).set({ version:  version });
    q.execute();
  }
};

/**
 * Model description
 */
Joli.model = function(options) {
  var defaults = {
    table: '',
    columns: {},
    objectMethods: {}
  };

  if (options.methods) {
    Joli.each(options.methods, function(method, name) {
      this[name] = method;
    }, this);
  }

  Joli.setOptions.call(this, options, defaults);
  this.table = this.options.table;

  if (!Joli.models.has(this.table)) {
    Joli.models.set(this.table, this);
  }
};

Joli.model.prototype = {
  all: function(constraints) {
    var q = new Joli.query().select().from(this.table);

    if (!constraints) {
      constraints = {};
    }

    if (constraints.where) {
      Joli.each(constraints.where, function(value, field) {
        q.where(field, value);
      });
    }

    if (constraints.order) {
      q.order(constraints.order);
    }

    if (constraints.limit) {
      q.limit(constraints.limit);
    }

    return q.execute();
  },

  count: function(constraints) {
    var q = new Joli.query().count().from(this.table);

    if (!constraints) {
      constraints = {};
    }

    if (constraints.where) {
      Joli.each(constraints.where, function(value, field) {
        q.where(field, value);
      });
    }

    return parseInt(q.execute(), 10);
  },

  // no callbacks, more efficient
  deleteRecords: function(id) {
    var q = new Joli.query().destroy().from(this.table);

    if (Joli.getType(id) === 'number') {
      q.where('id = ?', id);
    } else if(Joli.getType(id) === 'array') {
      q.whereIn('id', id);
    }

    return q.execute();
  },

  exists: function(id) {
    var count = new Joli.query().count().from(this.table).where('id = ?', id).execute();
    return (count > 0);
  },

  findBy: function(field, value) {
    return new Joli.query().select().from(this.table).where(field + ' = ?', value).execute();
  },

  findById: function(value) {
    return this.findBy('id', value);
  },

  findOneBy: function(field, value) {
    var result = new Joli.query().select().from(this.table).where(field + ' = ?', value).limit(1).execute();

    if (result.length === 0) {
      return false;
    } else {
      return result[0];
    }
  },

  findOneById: function(value) {
    return this.findOneBy('id', value);
  },

  getColumns: function() {
    return this.options.columns;
  },

  newRecord: function(values) {
    if (!values) {
      values = {};
    }

    var data = {};

    Joli.each(this.options.columns, function(colType, colName) {
      data[colName] = (values[colName] === undefined) ? null : values[colName];
    });

    var record = new Joli.record(this).fromArray(data);

    record.isNew = function() {
      return true;
    };

    // add object methods
    if (this.options.objectMethods) {
      Joli.each(this.options.objectMethods, function(method, name) {
        record[name] = method;
      });
    }

    return record;
  },

  save: function(data) {
    if (data.data.length === 0) {
      return;
    }

    var q = new Joli.query();

    if (data.originalData) {
      // existing record
      q.update(this.table).set(data.data).where('id = ?', data.originalData.id);
    } else {
      // new record
      q.insertInto(this.table).values(data.data);
    }

    return q.execute();
  }
};

Joli.Models = function() {
  this.models = {};
  this.migration = new Joli.migration({ tableName: 'migration' });
};

Joli.Models.prototype = {
  get: function(table) {
    return this.models[table];
  },

  has: function(table) {
    if (this.models[table]) {
      return true;
    } else {
      return false;
    }
  },

  initialize: function() {
    Joli.each(this.models, function(model, modelName) {
      var columns = [];

      Joli.each(model.options.columns, function(type, name) {
        columns.push(name + ' ' + type);
      });
      var query = 'CREATE TABLE IF NOT EXISTS ' + modelName + ' (' + columns.join(', ') + ')';
      Joli.connection.execute(query);
    });
  },

  migrate: function(version) {
    // create migration table
    var query = 'CREATE TABLE IF NOT EXISTS ' + this.migration.table + ' (version)';
    Joli.connection.execute(query);

    if (this.migration.getVersion() < version) {
      Joli.each(this.models, function(model, modelName) {
        var query = 'DROP TABLE IF EXISTS ' + modelName;
        Joli.connection.execute(query);
      });

      // insert migration
      this.migration.setVersion(version);
    }
  },

  set: function(table, model) {
    this.models[table] = model;
  }
};

Joli.models = new Joli.Models();

Joli.query = function() {
  this.data = {
    from:            null,
    join:            [],
    limit:           null,
    operation:       null,
    order:           [],
    select_columns:  '*',
    set:             [],
    values:          [],
    where:           null
  };
};

Joli.query.prototype = {
  count: function() {
    this.data.operation = 'count';
    return this;
  },

  destroy: function() {
    this.data.operation = 'delete';
    return this;
  },

  execute: function() {
    return this.executeQuery(this.getQuery());
  },

  executeQuery: function(query) {
    var rows;

    switch (this.data.operation) {
      case 'count':
        rows = Joli.connection.execute(query);
        return this.getCount(rows);
      case 'insert_into':
        Joli.connection.execute(query);
        return Joli.connection.lastInsertRowId();
      case 'select':
        rows = Joli.connection.execute(query);
        return this.hydrate(rows);
      default:
        return Joli.connection.execute(query);
    }
  },

  from: function(table) {
    this.data.from = table;
    return this;
  },

  getCount: function(rows) {
    var result;

    if (null === rows) {
      return 0;
    }

    if (0 === rows.rowCount) {
      result = 0;
    } else {
      result = rows.fieldByName('total');
    }

    rows.close();
    return result;
  },

  getOperation: function() {
    switch (this.data.operation) {
      case 'count':
        return 'select count(*) as total from ' + this.data.from;
      case 'delete':
        return 'delete from ' + this.data.from;
      case 'insert_into':
        return 'insert into ' + this.data.from + ' (' + this.data.set.join(', ') + ') values (' + this.data.values.join(', ') + ')';
      case 'select':
        var join = '';

        if (this.data.join.length > 0) {
          Joli.each(this.data.join, function(value, key) {
            join = join + ' left outer join ' + value[0] + ' ON ' + value[1] + '=' + value[2];
          });
        }

        return 'select ' + this.data.select_columns + ' from ' + this.data.from + join;
      case 'update':
        return 'update ' + this.data.from + ' set ' + this.data.set.join(', ');
      default:
        throw("Operation type Error. Joli.query operation type must be an insert, a delete, a select or an update.");
    }
  },

  getQuery: function() {
    var query = this.getOperation();

    if (this.data.where) {
      query += ' where ' + this.data.where;
    }

    if (this.data.groupBy) {
      query += ' group by ' + this.data.groupBy.join(', ');
    }

    if (this.data.order.length > 0) {
      query += ' order by ' + this.data.order.join(', ');
    }

    if (this.data.limit) {
      query += ' limit ' + this.data.limit;
    }

    return query;
  },

  groupBy: function(group) {
    if ('string' == Joli.getType(group)) {
      group = [group];
    }

    this.data.groupBy = group;
    return this;
  },

  hydrate: function(rows) {
    var result = [];

    if (!rows) {
      return result;
    }

    //Titanium.API.log('debug', 'hydrating ' + rows.rowCount + ' rows.');
    var i;
    var rowData;
    var fieldCount;

    if (Titanium.Platform.name != 'android') {
      fieldCount = rows.fieldCount();
    } else {
      fieldCount = rows.fieldCount;
    }

    while (rows.isValidRow()) {
      i = 0;
      rowData = {};

      while (i < fieldCount) {
        rowData[rows.fieldName(i)] = rows.field(i);
        i++;
      }

      result.push(rowData);
      rows.next();
    }

    rows.close();
    return result;
  },

  insertInto: function(table) {
    this.data.operation = 'insert_into';
    this.data.from = table;
    return this;
  },

  join: function(table, local_id, foreign_id) {
    this.data.join.push([table, local_id, foreign_id]);
    return this;
  },

  limit: function(limit) {
    this.data.limit = limit;
    return this;
  },

  order: function(order) {
    if ('string' == Joli.getType(order)) {
      order = [order];
    }

    this.data.order = order;
    return this;
  },

  select: function(columns) {
    this.data.operation = 'select';

    if (columns) {
      this.data.select_columns = columns;
    }

    return this;
  },

  set: function(values) {
    Joli.each(values, function(expression, value) {
      if (-1 === value.indexOf('=')) {
        this.data.set.push(value + ' = ' + Joli.typeValue(expression));
      } else {
        // some particular expression containing "="
        this.data.set.push(value);
      }
    }, this);
    return this;
  },

  update: function(table) {
    this.data.operation = 'update';
    this.data.from = table;
    return this;
  },

  values: function(values) {
    Joli.each(values, function(expression, value) {
      this.data.set.push(value);
      this.data.values.push(Joli.typeValue(expression));
    }, this);
    return this;
  },

  where: function(expression, value) {
    if (null !== this.data.where) {
      this.data.where += ' and ';
    } else {
      this.data.where = '';
    }

    this.data.where += expression.replace(/\?/gi, '"' + value + '"');
    return this;
  },

  whereIn: function(expression, value) {
    if (null !== this.data.where) {
      this.data.where += ' and ';
    } else {
      this.data.where = '';
    }

    this.data.where += expression + ' IN ' + value;
    return this;
  }
};

Joli.record = function(table) {
  this._options = {
    table: table,
    columns: table.getColumns()
  };
  this._data = {};
};

Joli.record.prototype = {
  destroy: function() {
    if (!this.id) {
      throw("Unsaved record cannot be destroyed");
    } else {
      this._options.table.deleteRecords(this.id);
    }
  },

  fromArray: function(data) {
    if (data.id) {
      this._originalData = {};
      this.isNew = function() {
        return false;
      };
    } else {
      this._originalData = null;
      this.isNew = function() {
        return true;
      };
    }

    Joli.each(this._options.columns, function(colType, colName) {
      this[colName] = null;
      this[colName] = data[colName];
      this._data[colName] = null;
      this._data[colName] = data[colName];

      if (this._originalData) {
        this._originalData[colName] = data[colName];
      }
    }, this);

    return this;
  },

  isChanged: function() {
    if (this.isNew()) {
      return false;
    }

    return !(this.id && Joli.toQueryString(this._data) === Joli.toQueryString(this._originalData));
  },

  save: function() {
    var data = { data: this._data };

    if (this.isChanged()) {
      data.originalData = this._originalData;
      this._options.table.save(data);
    } else if(this.isNew()) {
      this._data.id = this._options.table.save(data);
    }

    // overwrite original data so it is no longer "dirty" OR so it is no longer new
    this._originalData = {};

    Joli.each(this._options.columns, function(colType, colName) {
      this._originalData[colName] = this._data[colName];
    }, this);

    this._data = this._originalData;

    this.isNew = function() {
      return false;
    };

    return true;
  },

  set: function(key, value) {
    this[key] = value;
    this._data[key] = value;
  }
};
