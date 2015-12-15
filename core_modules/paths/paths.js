C.registerModule("paths", true);

CM.paths.globals.entityPaths = {};

process.on("dbReady", function () {

  for (var collection in C.dbCollections) {

    C.dbCollections[collection].find({
      path: {
        $exists: true
      }
    }, function (err, doc) {

      if (!err && doc) {

        doc.forEach(function (element) {

          CM.paths.globals.entityPaths[element.path] = {
            _id: element._id,
            eid: element.eid,
            entityType: element.entityType
          };

        });

      }

    });

  };

});

// Format a path automatically, e.g. from an entity's title

CM.paths.globals.makePath = function (title) {

  title = title.replace(/[\W_]+/g, "-");

  return title;

};

// Enable AJAX fetching of formatted path so that the edit form can prefill

C.app.get('/admin/api/makepath', function (req, res) {

  res.send(CM.paths.globals.makePath(req.body.title));

});

// Append number to duplicate paths

CM.paths.globals.makePathUnique = function (path) {

  var isDuplicate = true;
  var counter = 1;

  var workingPath = path;

  while (isDuplicate) {

    if (CM.paths.globals.entityPaths[workingPath]) {

      // This is a duplicate

      workingPath = path + '-' + counter;

      counter++;

    } else {

      isDuplicate = false;

    }

  }

  return workingPath;

};

CM.paths.registerHook("hook_entity_validate", 0, function (thisHook, data) {

  // Check that path is not a duplicate

  var path = data.path;
  var eid = data.eid;

  // If path already listed, and
  //   - Entity is new and has no id, or
  //   - Entity id being edited does not match


  if (false && CM.paths.globals.entityPaths[path] && (!eid || CM.paths.globals.entityPaths[path].eid.toString() !== eid.toString())) {

    thisHook.finish(false, "Entity with that path already exists")

  } else {

    thisHook.finish(true, data);

  }

});

CM.paths.registerHook("hook_entity_created", 0, function (thisHook, data) {

  if (data.path) {

    var path = data.path;
    var id = data._id;
    var eid = data.eid;
    var entityType = data.entityType;

    CM.paths.globals.entityPaths[path] = {
      _id: id,
      eid: eid,
      entityType: entityType
    };

    thisHook.finish(true, data);

  } else {

    thisHook.finish(true, data);

  }

});

CM.paths.registerHook("hook_entity_updated", 0, function (thisHook, data) {

  // Remove any paths in the list that point to this entity

  for (var path in CM.paths.globals.entityPaths) {

    if (CM.paths.globals.entityPaths[path]._id === id) {

      delete CM.paths.globals.entityPaths[path];

    }

  }

  // Recreate them or create anew

  if (data.path) {

    var path = data.path;
    var id = data._id;
    var eid = data.eid;
    var entityType = data.entityType;

    CM.paths.globals.entityPaths[path] = {
      _id: id,
      eid: eid,
      entityType: entityType
    };

    thisHook.finish(true, data);

  } else {

    thisHook.finish(true, data);

  }

});

// Handle custom paths

C.app.use(function (req, res, next) {

  if (req.method !== "GET") {

    next();
    return false;

  }

  // Look up entity with the current 'path'

  if (CM.paths.globals.entityPaths[req.url]) {

    C.dbCollections[CM.paths.globals.entityPaths[req.url].entityType].findOne({
      eid: CM.paths.globals.entityPaths[req.url].eid
    }, function (err, doc) {

      if (!err && doc) {

        CM.frontend.globals.getTemplate(doc, req.authPass, {
          req: req
        }).then(function (html) {

          res.send(html);

          next();

        }, function (fail) {

          C.hook("hook_display_error_page", req.authPass, {
            error: 500,
            req: req
          }).then(function (success) {

            res.send(success);
            
          }, function (fail) {

            res.send("500");

          });

        });

      } else {

        next();

      }

    });

  } else {

    next();

  }

});