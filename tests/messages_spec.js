var exports;

var frisby = require('frisby');

var config = require('./test_config');

var apiUrl = config.apiUrl;

// Import dependent specs

var messages_spec = require('./messages_spec');

// CREATE GROUP - normal, 1 member (VALID)

var message_normal_base = {

  userid: "1",
  content: "Test message.",
  type: "text",
//  hideFromPublicGroup: false;


}

exports.createMessage_val = function (data) {

  message_normal_base.credentials = data.userCredentials;

  var message = message_normal_base;

  message.groupid = data.groupid;

  frisby.create("Create message (standard)")
    .post(apiUrl + '/entity/create/message', message)
    .expectStatus(200)
    .inspectBody()
    .expectJSON({
      userid: function (val) {
        expect(val).toBe(message.userid);
      },
      type: function (val) {
        expect(val).toBe(message.type);
      },
      content: function (val) {
        expect(val).toBe(message.content);
      },
      groupid: function (val) {
        expect(val).toBe(message.groupid);
      }
    })
    .afterJSON(function (json) {


    })
    .toss();

};

module.exports = exports;