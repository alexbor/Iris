/**
 * @file Admin forms for altering user permissions.
 */
var fs = require('fs');

iris.modules.menu.globals.registerMenuLink("admin-toolbar", "/admin/users", "/admin/users/permissions", "Permissions", 1);

// Permissions form

iris.modules.permissionsUI.registerHook("hook_form_render_permissions", 0, function (thisHook, data) {

  // Check if menu name supplied and previous values available

  try {
    var currentPermissions = fs.readFileSync(iris.sitePath + "/configurations/auth/permissions.json", "utf8");

    var current = JSON.parse(currentPermissions);

  } catch (e) {

    var current = {};

  }

  var permissions = iris.modules.auth.globals.permissions;

  var roles = iris.modules.auth.globals.roles;

  var permissionSchema = {};
  var form = [];

  // Loop over each permission and add a schema item for it.

  // Categories first, later move these into fieldsets

  Object.keys(iris.modules.auth.globals.permissions).forEach(function (category) {

    var items = [];

    Object.keys(iris.modules.auth.globals.permissions[category]).forEach(function (permissionName) {

      var permission = iris.modules.auth.globals.permissions[category][permissionName].name;

      permissionSchema[permission] = {
        "type": "array",
        "title": permission.toUpperCase(),
        "description": iris.modules.auth.globals.permissions[category][permissionName].description,
        "items": {
          "type": "string",
          "enum": Object.keys(roles)
        }
      }

      items.push({
        "key": permission,
        "type": "checkboxbuttons",
        "activeClass": "btn-success"
      });

    })

    form.push({
      "type": "fieldset",
      "title": category,
      "expandable": false,
      "items": items
    })

  });

  permissionSchema.formid = {
    "type": "hidden"
  }

  form.push({
    "key": "formid"
  });

  form.push({
    "key": "formToken"
  });

  form.push({
    "title": "Submit",
    "type": "submit"
  });

  Object.keys(permissionSchema).forEach(function (item) {

    data.schema[item] = permissionSchema[item];

  })

  data.form = form;
  data.value = current;

  data.value["formid"] = "permissions";

  thisHook.finish(true, data);

})

iris.modules.permissionsUI.registerHook("hook_form_submit_permissions", 0, function (thisHook, data) {

  fs.writeFileSync(iris.sitePath + "/configurations/auth/permissions.json", JSON.stringify(thisHook.const.params), "utf8");

  data = function (res) {

    res.json("/admin");

  }

  thisHook.finish(true, data);

});


iris.app.get("/admin/users/permissions", function (req, res) {

  // If not admin, present 403 page

  if (req.authPass.roles.indexOf('admin') === -1) {

    iris.modules.frontend.globals.displayErrorPage(403, req, res);

    return false;

  }

  iris.modules.frontend.globals.parseTemplateFile(["admin_permissions"], ['admin_wrapper'], {}, req.authPass, req).then(function (success) {

    res.send(success)

  }, function (fail) {

    iris.modules.frontend.globals.displayErrorPage(500, req, res);

    iris.log("error", fail);

  });

});