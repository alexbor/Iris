/*jslint node: true nomen: true*/
"use strict";

/*  Group Manager Module
 *
 *  Provides an essential group management system. Provides hooks for creating and editing groups.
 *  All user interactions take place in the context of a group.
 *
 *  Core hooks:
 *  hook_group_list_users
 *  hook_group_update
 *
 *  API endpoints:
 *  /fetch/group/users
 *  /fetch/groups
 *  /debug/groups
 *  /group/add
 *  /group/update/addmember
 *  /group/update/removemember
 *  /group/update/name
 */

//var mongoClient = require('mongodb').MongoClient;
var objectID = require('mongodb').ObjectID;

//Translate default name to list of users (not including current user)

var defaultname = function (members, userid) {

  var name = "";

  if (members.length > 1) {
    members.forEach(function (element, index) {

      if (element.uid) {

        element.userid = element.uid;

      }

      if (process.usercache[element.userid] && element.userid !== userid) {

        name += process.usercache[element.userid].username;
        name += ", ";

      }

    });

    // Trim last comma from the end.
    name = name.slice(0, -2);

  } else {
    if (process.usercache[userid]) {
      name = process.usercache[userid].username;
    }
  }

  return name;

};

process.defaultname = defaultname;

var getavatar = function (group, userid) {

  if (group.is121) {
    var avatar;
    group.members.forEach(function (element, index) {
      if (element.userid != userid) {
        if (process.usercache[element.userid] && process.usercache[element.userid].avatar) {
          avatar = process.usercache[element.userid].avatar;
        }
      }
    });

    if (!avatar) {
      avatar = null;
    }

    return avatar;
  } else if (group.entityref) {
    var avatar;
    if (group.avatar) {
      avatar = group.avatar;
    } else {
      avatar = null;
    }

    return avatar;
  } else {
    return null;
  }
}

var exports = {
  options: {
    allowdebug: false
  },
  schemas: {
    
    group: mongoose.Schema({
    
      name: String
    
    })
    
  },
  globals: {
    isGroupMember: function (userid, groupid, callback) {
     
      // Call db find hook.
      hook('hook_db_find', {
        dbcollection: 'groups',
        dbquery: {
          'members': {
            '$elemMatch': {
              'userid': userid
            }
          },
          '_id': objectID(groupid)
        }
      }, function (gotData) {
        
        if(gotData.returns){
         
          callback(true);
          
        } else {
          
          callback(false);
          
        }

      })
    }
  },
  // TODO: this module needs refactoring methinks. but hey, it does work.
  hook_get_fetch_group: {
    rank: 0,
    event: function (data) {
      hook('hook_fetch_group', {
        userid: data.get.userid,
        token: data.get.token,
        groupid: data.get.groupid
      }, function (gotData) {
        data.returns = JSON.stringify(gotData.returns);
        process.emit('next', data);
      });
    }
  },
  hook_fetch_group: {
    rank: 0,
    event: function (data) {
      if (data.userid && data.token && data.groupid) {

        // Check objectID valid
        try {
          data.groupid = objectID(data.groupid);
        } catch (e) {
          data.returns = "ERROR: Bad ObjectID";
          process.emit("next", data);
          return false;
        }

        // Promise functions

        var dbFind = function (data) {
          return new Promise(function (yes, no) {
            // Call db find hook.
            hook('hook_db_find', {
              dbcollection: 'groups',
              dbquery: {
                members: {
                  $elemMatch: {
                    'userid': data.userid
                  }
                },
                '_id': data.groupid
              }
            }, function (gotData) {

              var groupdata = JSON.parse(gotData.returns);

              groupdata.forEach(function (element, index) {
                if (element.name === 'default') {
                  groupdata[index].name = defaultname(element.members, data.userid);
                }

                groupdata[index].avatar = getavatar(element, data.userid);
              });

              data.returns = groupdata;

              yes(data);

            });

          });
        };

        hookPromiseChain([C.auth.authCheck, dbFind], data);

      } else {
        data.returns = "ERROR: Missing userid, token or groupid.";
        process.emit('next', data);
      }
    }
  },
  hook_group_list_users: {
    rank: 0,
    event: function (data) {

      if (objectID.isValid(data.groupid)) {
        var groupid = data.groupid,
          userid = data.userid, // optional: only return results that include this user
          query = {
            '_id': objectID(groupid)
          };

        if (userid) {
          query = {
            '_id': objectID(groupid),
            members: {
              $elemMatch: {
                'userid': data.userid.toString()
              }
            }
          };
        }

        hook('hook_db_find', {
            dbcollection: 'groups',
            dbquery: query
          },
          function (gotData) {
            if (gotData.returns && JSON.parse(gotData.returns)[0]) {
              data.returns = JSON.parse(gotData.returns)[0].members;

              data.returns.forEach(function (element, index) {

                var property;

                for (property in process.usercache[element.userid]) {


                  data.returns[index][property] = process.usercache[element.userid][property];


                }
              });

              process.emit('next', data);
            } else {
              console.log("[INFO] hook_group_list_users: Request for nonexistent or inaccessible group ID");
              data.returns = false;
              process.emit('next', data);
            }
          });
      } else {
        console.log("[INFO] hook_group_list_users: Request for bad ObjectID");
        data.returns = false;
        process.emit('next', data);
      }
    }
  },
  // GET /fetch/group/users
  hook_get_fetch_group_users: {
    rank: 0,
    event: function (data) {
      if (data.auth > 0) {
        var groupid = data.get.groupid;

        if (objectID.isValid(data.get.groupid)) {
          hook('hook_group_list_users', {
              'groupid': groupid,
              'userid': data.get.userid
            },
            function (gotData) {
              if (typeof gotData.returns !== 'string') {
                data.returns = JSON.stringify(gotData.returns);
              } else {
                data.returns = gotData.returns;
              }
              process.emit('next', data);
            });
        } else {
          data.returns = "ERROR: Invalid group ID.";
          process.emit('next', data);
        }
      } else {
        data.returns = "ERROR: Authentication failed.";
        process.emit('next', data);
      }
    }
  },
  // POST /group/add
  hook_post_group_add: {
    rank: 0,
    event: function (data) {

      // userid, token, name, members[], is121

      data.group = {};

      // check to see if group already exists.

      var errorCheck = function () {

        return new Promise(function (yes, no) {

          if (data.auth < 1) {

            data.errors.push("No valid authentication.");
            no(data);

          }

          if (data.post.groupid && data.post.entityRef) {

            data.errors.push("Not possible to use groupid and entityRef at the same time.");
            no(data);

          }

          if (data.post.is121 && data.post.entityRef) {

            data.errors.push("Group cannot have an entity reference if it is a one-to-one conversation");
            no(data);

          }

          // Parse, if possible, the members and permissions
          try {
            data.post.members = JSON.parse(data.post.members);

            data.post.members.forEach(function (element, index) {
              // Convert userid to string. Put userid and joined time into members object.
              data.post.members[index] = {
                userid: element.toString(),
                joined: Date.now()
              };
            });
          } catch (e) {
            data.errors.push("Members are not valid.");
            no(data);
          }

          try {
            data.post.permissions = JSON.parse(data.post.permissions);
          } catch (e) {
            data.errors.push("Permissions are not valid.");
            no(data);
          }

          if (data.post.is121 && data.post.is121 !== "false") {
            data.post.is121 = true;
          }

          data.group = {

            "name": data.post.name,
            "members": data.post.members,
            "entityRef": data.post.entityRef,
            "permissions": data.post.permissions,
            "is121": data.post.is121,
            "groupid": data.post.groupid

          }

          yes(data);

        });

      };

      var addGroup = function () {

        return new Promise(function (yes, no) {

          hook("hook_group_add", data.group, function (groupid) {

            data.returns = groupid.returns.toString();
            yes(data);

          });

        });

      };

      hookPromiseChain([errorCheck, addGroup], data);

    }

  },
  hook_group_add: {
    rank: 0,
    event: function (data) {

      // Should check for duplicate members (move to database schema)
      // Should allow only two users in a 121 group

      //Create basic group object

      var group = {

        "name": data.name,
        "members": data.members,
        "permissions": data.permissions

      }

      if (data.entityRef) {

        group.entityRef = data.entityRef;

      }

      //Check if 1to1 group and, if so, check if it doesn't already exist. If it does already exist, error out

      var check1to1 = function (data) {

        return new Promise(function (yes, no) {

          if (data.is121) {

            hook('hook_db_find', {
              dbcollection: 'groups',
              dbquery: {
                'is121': true,
                '$and': [{
                  'members': {
                    '$elemMatch': {
                      'userid': data.members[0]
                    }
                  }
                }, {
                  'members': {
                    '$elemMatch': {
                      'userid': data.members[1]
                    }
                  }
                }]
              }
            }, function (result) {

              if (result.returns && JSON.parse(result.returns).length === 0) {

                //121 doesn't already exist
                yes(data);

              } else {

                data.errors.push("Group already exists");
                no(data);

              }
            });

          } else {

            yes(data);

          }

        });

      };

      // Upsert the groups

      var upsertGroups = function (data) {

        return new Promise(function (yes, no) {

          if (data.entityRef) {

            hook('hook_db_update', {
              dbcollection: 'groups',
              dbquery: {
                entityRef: data.entityRef
              },
              dbupdate: group,
              dbupsert: true
            }, function (newGroup) {

              newGroup = newGroup.returns[0];

              data.returns = newGroup._id;

              yes(data);

            });

          } else if (data.groupid) {

            hook('hook_db_update', {
              dbcollection: 'groups',
              dbquery: {
                _id: objectID(data.groupid)
              },
              dbupdate: group,
              dbupsert: true
            }, function (newGroup) {

              newGroup = newGroup.returns[0];

              data.returns = newGroup._id;

              yes(data);

            });

          } else {

            hook('hook_db_insert', {
              dbcollection: 'groups',
              dbobject: group
            }, function (newGroup) {

              newGroup = newGroup.returns[0];

              data.returns = newGroup._id;

              yes(data);

            });

          };

        });

      };

      hookPromiseChain([check1to1, upsertGroups], data);

    }

  },
  hook_get_fetch_groups: {
    rank: 0,
    event: function (data) {

      if (data.get.userid && data.get.token) {

        if (data.auth > 0) {
          hook('hook_fetch_groups', {
            userid: data.get.userid
          }, function (groups) {
            data.returns = groups.returns;
            process.emit('next', data);
          });
        } else {
          data.returns = "ERROR: Authentication failed.";
          process.emit('next', data);
        }

      } else {
        data.returns = "ERROR: Missing userid or token.";
        process.emit('next', data);
      }
    }
  },
  hook_fetch_groups: {
    rank: 0,
    event: function (data) {
      if (data.userid) {

        // Call db find hook.
        hook('hook_db_find', {
          dbcollection: 'groups',
          dbquery: {
            members: {
              $elemMatch: {
                'userid': data.userid
              }
            }
          }
        }, function (gotData) {
          var groupdata = JSON.parse(gotData.returns);

          groupdata.forEach(function (element, index) {
            if (element.name === 'default') {
              groupdata[index].name = defaultname(element.members, data.userid);
            }

            groupdata[index].avatar = getavatar(element, data.userid);
          });

          data.returns = JSON.stringify(groupdata);

          process.emit('next', data);
        });

      }
    }
  },
  hook_group_update: {
    rank: 0,
    event: function (data) {

      var query;
      if (data.userid) {
        query = {
          '_id': objectID(data.groupid),
          $or: [{
            'is121': false
                    }, {
            'is121': {
              $exists: false
            }
                    }],
          members: {
            $elemMatch: {
              'userid': data.userid.toString()
            }
          }
        };
      } else {
        if (data.groupid) {
          query = {
            '_id': objectID(data.groupid)
          };
        } else if (data.reftype === 'event') {
          query = {
            'reftype': 'event',
            'entityref': data.entityref
          };
        }
        data.userid = 0;
      }

      if (data.action === 'addmember') {

        var addquery = {
          members: {
            $elemMatch: {
              'userid': data.members
            }
          }
        }

        if (data.groupid) {
          addquery['_id'] = objectID(data.groupid);
        } else {
          addquery['reftype'] = data.reftype;
          addquery['entityref'] = data.entityref;
        }

        hook('hook_db_find', {
          dbcollection: 'groups',
          dbquery: addquery
        }, function (existing) {

          // If this user doesn't yet exist
          if (existing.returns && existing.returns === '[]') {

            hook('hook_db_update', {
              dbcollection: 'groups',
              dbquery: query,
              dbupdate: {
                $push: {
                  members: {
                    'userid': data.members,
                    'joined': Date.now()
                  }
                }
              },
              dbmulti: true,
              dbupsert: false
            }, function (gotData) {
              data.returns = gotData.returns;

              // Put a message into the group directly

              hook("hook_send_joined_message", {
                userid: data.userid,
                members: data.members,
                groupid: data.groupid
              }, function (gotData) {
                process.emit("next", data);
              });

            });

          } else {
            data.returns = 'ERROR: That user is already present in the group.';
            process.emit('next', data);
          }

        });

      } else if (data.action === 'removemember') {

        hook('hook_db_update', {
          dbcollection: 'groups',
          dbquery: query,
          dbupdate: {
            $pull: {
              members: {
                'userid': data.members
              }
            }
          },
          dbmulti: true,
          dbupsert: false
        }, function (gotData) {

          data.removedmember = data.members;

          data.returns = gotData.returns;
          process.emit('next', data);
        });

      } else if (data.action === 'name') {
        hook('hook_db_update', {
          dbcollection: 'groups',
          dbquery: query,
          dbupdate: {
            $set: {
              name: data.name
            }
          },
          dbmulti: false,
          dbupsert: false
        }, function (gotData) {
          data.returns = gotData.returns;
          process.emit('next', data);
        });

      } else {
        data.returns = false;
        process.emit('next', data);

      }
    }
  },
  // POST /group/update/addmember
  hook_post_group_update_addmember: {
    rank: 0,
    event: function (data) {

      if (data.post.members && (data.post.groupid && objectID.isValid(data.post.groupid)) || (data.post.entityref && data.post.reftype)) {

        if (data.post.apikey && data.post.secretkey) {
          hook('hook_secretkey_check', {
            apikey: data.post.apikey,
            secretkey: data.post.secretkey
          }, function (valid) {
            if (valid.returns === true) {

              var updatequery = {
                action: 'addmember',
                userid: data.post.userid,
                members: data.post.members
              };

              if (data.post.reftype === 'event') {
                updatequery['reftype'] = data.post.reftype;
                updatequery['entityref'] = data.post.entityref;
              } else {
                updatequery['groupid'] = data.post.groupid;
              }

              hook('hook_group_update',
                updatequery,
                function (gotData) {
                  data.returns = gotData.returns;
                  process.emit('next', data);
                });

            } else {
              data.returns = "ERROR: Secret key incorrect";
              process.emit('next', data);
            }
          });
        } else {
          if (data.auth > 0) {

            hook('hook_group_update', {
              action: 'addmember',
              userid: data.post.userid,
              members: data.post.members,
              groupid: data.post.groupid
            }, function (gotData) {
              data.returns = gotData.returns;
              process.emit('next', data);
            });

          } else {
            data.returns = "ERROR: Authentication failed.";
            process.emit('next', data);
          }

        }
      } else {
        data.returns = "ERROR: Invalid userid or groupid.";
        process.emit('next', data);
      }
    }
  },
  // POST /group/update/removemember
  hook_post_group_update_removemember: {
    rank: 0,
    event: function (data) {

      if (data.post.members && data.post.groupid && objectID.isValid(data.post.groupid)) {

        if (data.post.apikey && data.post.secretkey) {
          hook('hook_secretkey_check', {
            apikey: data.post.apikey,
            secretkey: data.post.secretkey
          }, function (valid) {
            if (valid.returns === true) {

              hook('hook_group_update', {
                action: 'removemember',
                members: data.post.members,
                userid: data.post.userid,
                groupid: data.post.groupid
              }, function (gotData) {
                data.returns = gotData.returns;
                process.emit('next', data);
              });

            } else {
              data.returns = "ERROR: Secret key incorrect";
              process.emit('next', data);
            }
          });
        } else {
          if (data.auth > 0) {

            hook('hook_group_update', {
              action: 'removemember',
              members: data.post.members,
              userid: data.post.userid,
              groupid: data.post.groupid
            }, function (gotData) {
              data.returns = gotData.returns;
              process.emit('next', data);
            });
          } else {
            data.returns = "ERROR: Authentication failed.";
            process.emit('next', data);
          }

        }
      } else {
        data.returns = "ERROR: Invalid userid or groupid.";
        process.emit('next', data);
      }
    }
  },
  // POST /group/update/name
  hook_post_group_update_name: {
    rank: 0,
    event: function (data) {

      if (data.post.name && data.post.groupid && objectID.isValid(data.post.groupid)) {

        if (data.post.apikey && data.post.secretkey) {
          hook('hook_secretkey_check', {
            apikey: data.post.apikey,
            secretkey: data.post.secretkey
          }, function (valid) {
            if (valid.returns === true) {

              hook('hook_group_update', {
                action: 'name',
                name: data.post.name,
                groupid: data.post.groupid,
                userid: data.post.userid
              }, function (gotData) {
                data.returns = gotData.returns;
                process.emit('next', data);
              });

            } else {
              data.returns = "ERROR: Secret key incorrect";
              process.emit('next', data);
            }
          });
        } else {
          if (data.auth > 0) {

            hook('hook_group_update', {
              action: 'name',
              name: data.post.name,
              groupid: data.post.groupid,
              userid: data.post.userid
            }, function (gotData) {
              data.returns = gotData.returns;
              process.emit('next', data);
            });

          } else {
            data.returns = "ERROR: Authentication failed.";
            process.emit('next', data);
          }

        }

      } else {
        data.returns = "ERROR: Invalid new name or groupid.";
        process.emit('next', data);
      }
    }
  },
  hook_post_group_remove: {
    rank: 0,
    event: function (data) {
      // only works for read-only groups
      // secret key, groupid

      if (data.post.apikey && data.post.secretkey && data.post.groupid && objectID.isValid(data.post.groupid)) {
        hook('hook_secretkey_check', {
          apikey: data.post.apikey,
          secretkey: data.post.secretkey
        }, function (valid) {
          if (valid.returns === true) {

            // Delete the group in the database
            hook('hook_db_remove', {
              dbcollection: 'groups',
              dbquery: {
                '_id': objectID(data.post.groupid),
              }
            }, function (deleteReturns) {
              data.returns = deleteReturns.returns;
              process.emit('next', data);
            });

          } else {
            data.returns = "ERROR: Secret key incorrect";
            process.emit('next', data);
          }

        });

      } else {
        data.returns = "ERROR: Missing secret key or groupid.";
        process.emit('next', data);
      }
    }
  },
  hook_groupid_from_messageid: {
    rank: 0,
    event: function (data) {
      var messageid = objectID(data.messageid);

      hook('hook_db_find', {
        dbcollection: 'messages',
        dbquery: {
          '_id': messageid
        }
      }, function (gotData) {
        try {
          data.returns = JSON.parse(gotData.returns)[0].groupid;
        } catch (err) {
          console.log('invalid messageid?');
        }
        process.emit('next', data);
      });
    }
  },
  hook_post_group_121upsert: {
    rank: 0,
    event: function (data) {

      if (data.post.userids && data.post.userid && data.post.apikey && data.post.secretkey) {
        hook('hook_secretkey_check', {
          apikey: data.post.apikey,
          secretkey: data.post.secretkey
        }, function (check) {

          if (check.returns === true) {

            var userids;
            try {
              userids = JSON.parse(data.post.userids);
            } catch (err) {
              data.returns = "ERROR: Bad list of userids.";
              process.emit("next", data);
              return;
            }

            hook("hook_db_find", {
              dbcollection: 'groups',
              dbquery: {
                'is121': true,
                "members": {
                  $all: [{
                    $elemMatch: {
                      "userid": data.post.userid
                    }
                  }, {
                    $elemMatch: {
                      "userid": {
                        "$in": userids
                      }
                    }
                  }]
                }
              }
            }, function (groups) {
              groups = JSON.parse(groups.returns);

              var existing121users = [];

              var returngroups = [];

              groups.forEach(function (element, index) {

                element.members.forEach(function (member) {

                  if (member.userid.toString() !== "1") {
                    existing121users.push(member.userid);
                    returngroups.push(element._id);
                  }

                });

              });

              var userstocreate = userids.filter(function (i) {
                return existing121users.indexOf(i) === -1;
              });

              if (userstocreate.length > 0) {

                userstocreate.forEach(function (user, index, array) {

                  hook('hook_group_add', {
                    name: 'default',
                    members: [user, data.post.userid],
                    is121: true
                  }, function (newgroupid) {

                    if (newgroupid.success === true) {

                      returngroups.push(newgroupid.returns);

                      if (index === array.length - 1) {
                        data.returns = JSON.stringify(returngroups);
                        process.emit("next", data);
                      }

                    }

                  });

                });

              } else {

                data.returns = JSON.stringify(returngroups);
                process.emit("next", data);

              }

            });

          } else {

            //Authentication failed
            data.returns = "ERROR: Invalid secretkey.";
            process.emit("next", data);

          }

        });

      } else {

        //Wrong details sent
        data.returns = "ERROR: Missing parameters.";
        process.emit("next", data);

      }

    }

  }

};

module.exports = exports;
