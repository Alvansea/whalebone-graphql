'use strict';

const { 
  GraphQLObjectType, 
  GraphQLNonNull, 
  GraphQLScalarType, 
  GraphQLList, 
  GraphQLFloat,
  GraphQLInt,
  GraphQLID,
  GraphQLString, 
  GraphQLSchema } = require('graphql');
const { Router } = require('express');

var GraphQLDate =
exports.GraphQLDate = new GraphQLScalarType({
  name: 'Date',
  description: 'GraphQL Date type',
  serialize(value) {
    let result = value.toJSON();
    // Implement your own behavior here by setting the 'result' variable
    return result;
  },
  parseValue(value) {
    let result = new Date(value);
    // Implement your own behavior here by setting the 'result' variable
    return result;
  },
  parseLiteral(ast) {
    let result = new Date(value);
    // Implement your own behavior here by setting the 'result' variable
    return result;
  }
});

/**
 *  Convert mogoose fields defination to graphql fields defination
 */
var parseFields =
exports.parseFields = function(fields) {
  let gqlFields = {};
  for(var fieldname in fields) {
    let field, fieldType;
    let fieldDef = fields[fieldname];
    let isArray = false;
    if(fieldDef instanceof Array) {
      isArray = true;
      fieldDef = fieldDef[0];
    }
    if(fieldDef.graphqlExclude) {
      continue;
    }
    switch(fieldDef.type) {
      case String:
        fieldType = GraphQLString;
        break;
      case Number:
        if(fieldDef.graphqlType == 'int') {
          fieldType = GraphQLInt;
        } else {
          fieldType = GraphQLFloat;
        }
        break;
      case Boolean:
        fieldType = GraphQLBoolean;
        break;
      default:
        fieldType = GraphQLString;
        break;
    }
    if(fieldDef.required) {
      fieldType = new GraphQLNonNull(fieldType);
    }
    if(isArray) {
      fieldType = new GraphQLList(fieldType);
    }
    gqlFields[fieldname] = {
      type: fieldType
    };
  }
  return gqlFields;
}

/**
 *  Whalebone digestor
 *  config may contain below properties
 *  - name: String!
 *  - description: String
 *  - fields: Object! (key-value pairs)
 *  - config: Object (key-value pairs)
 */
exports.type = 
exports.graphql_type = function(config) {
  let gqlFields = parseFields(config.fields);
  gqlFields._id = {
    type: new GraphQLNonNull(GraphQLID)
  };
  if(config.options && config.options.timestamps) {
    gqlFields.createdAt = {
      type: GraphQLDate
    };
    gqlFields.updatedAt = {
      type: GraphQLDate
    };
  }
  var type = new GraphQLObjectType({
    name: config.name,
    description: config.description || '',
    fields: function () {
      return gqlFields;
    }
  });
  if(this && typeof(this.asset) == 'function') {
    this.asset('graphql_types')[config.name] = type;
  }
  return type;
}

/**
 *  Whalebone digestor
 *  config must contain below properties
 *  - queries: { 
 *      name: { output: ... } 
 *    }
 *  - query handlers which mapping the name defined in "queries"
 */
exports.query = 
exports.graphql_query = function(config) {
  let queries = {};
  if(!config.queries) {
    return queries;
  }
  for(var name in config.queries) {
    const queryMethod = config[name];
    if(!queryMethod) {
      continue;
    }
    const output = config.queries[name].output;
    let type;
    if(output instanceof Array) {
      type = new GraphQLList(output[0]);
    } else {
      type = output;
    }
    queries[name] = {
      type: type,
      resolve: function(root, args) {
        return queryMethod(root, args);
      }
    }
  }
  if(this && typeof(this.asset) == 'function') {
    let queryAsset = this.asset('graphql_queries');
    queryAsset = Object.assign(queryAsset, queries);
  }
  return queries;
}

/**
 *  Whalebone digestor
 *  config must contain below properties
 *  - mutations: { 
 *      name: { input: ... , output: ... } 
 *    }
 *  - mutation handlers which mapping the name defined in "mutations"
 */
exports.mutation = 
exports.graphql_mutation = function(config) {
  let mutations = {};
  if(!config.mutations) {
    return mutations;
  }
  for(var name in config.mutations) {
    const mutationMethod = config[name];
    if(!mutationMethod) {
      continue;
    }
    const def = config.mutations[name];
    const input = parseFields(def.input);
    const output = def.output;
    let type;
    if(output instanceof Array) {
      type = new GraphQLList(output[0]);
    } else {
      type = output;
    }
    mutations[name] = {
      type: type,
      args: input,
      resolve: function(root, args) {
        return mutationMethod(root, args);
      }
    }
  }
  if(this && typeof(this.asset) == 'function') {
    let asset = this.asset('graphql_mutations');
    asset = Object.assign(asset, mutations);
  }
  return mutations;
}

/**
 *  Whalebone digestor
 *  digest quries and mutations
 */
exports.resolver = 
exports.graphql_resolver = function(config) {
  exports.graphql_query.call(this, config);
  exports.graphql_mutation.call(this, config);
}

/**
 *  Whalebone exportor
 *  export GraphQLSchema instance
 */
exports.schema = 
exports.graphql_schema = function() {
  if(typeof(this.asset) != 'function') {
    return null;
  }
  const queries = this.asset('graphql_queries');
  const mutations = this.asset('graphql_mutations');
  var schemaOptions = {};
  if(Object.keys(queries).length) {
    schemaOptions.query = new GraphQLObjectType({
      name: 'Query',
      fields: queries,
    });
  }
  if(Object.keys(mutations).length) {
    schemaOptions.mutation = new GraphQLObjectType({
      name: 'Mutation',
      fields: mutations
    })
  }
  var schema = new GraphQLSchema(schemaOptions);
  return schema;
}

/**
 *  Whalebone exportor
 *  return express router for graphql queries and mutations
 */
exports.router = 
exports.graphql_router = function() {
  var router = Router();
  if(this && typeof(this.asset) == 'function') {

    // inject middleware for queries
    const queries = this.asset('graphql_queries', {})
    for(var name in queries) {
      const query = queries[name];
      router.get('/' + name, function(req, res, next) {
        query.resolve(null, req.query).then(function(data) {
          res.send(data);
        }).catch(err => next(err));
      })
    }

    // inject middleware for mutations
    const mutations = this.asset('graphql_mutations', {})
    for(var name in mutations) {
      const mutation = mutations[name];
      router.post('/' + name, function(req, res, next) {
        mutation.resolve(null, req.body).then(function(data) {
          res.send(data);
        }).catch(err => next(err));
      })
    }
  }
  return router;
}