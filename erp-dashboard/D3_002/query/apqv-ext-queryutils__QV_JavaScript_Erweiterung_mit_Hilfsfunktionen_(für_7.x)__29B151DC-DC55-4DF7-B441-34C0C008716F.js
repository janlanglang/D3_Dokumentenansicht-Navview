var extQueryUtils = {
  "callWithQueryData": function (queryName, paramObject, callback) {

   if (typeof callback === "function") {
     var req = new XMLHttpRequest();

      req.onreadystatechange = function () {
        var dataObject;
        var resultObject = {
          "success": true,
          "errorText": null,
          "responseText": null
        };
        
        if (this.readyState === 4) {
          dataObject = null;
          
          if (this.status === 200) {
            try {
              dataObject = JSON.parse(this.responseText);
            }
            catch (ex) {
              resultObject.success = false;
              resultObject.errorText = ex;
              resultObject.responseText = this.responseText;
            }
          }
          else {
            resultObject.success = false;
            resultObject.errorText = this.statusText;
          }
          
          callback(dataObject, resultObject);
        } // if
        
      };
      
      
      req.open("GET", extQueryUtils.getQueryJsonUrl(queryName, paramObject), true);
      req.send();
   }
  }, // callWithQueryData
  
  "getQueryJsonUrl": function (queryName, paramObject) {
    
    var url = "Query.aspx?name=" + encodeURIComponent(queryName) + "&xhr=json&t=" + Date.parse(new Date())
      + (global.language !== "" ? "&lng=" + encodeURIComponent(global.language) : "")
      + (paramObject !== null && typeof paramObject === "object" ? "&param=" + encodeURIComponent(Tools.getUrlStringFromObject(paramObject)) : "");

    return (url);
  }, // getQueryJsonUrl
  
  
  // 🔄 Promisifizierte Version
  callWithQueryDataAsync: function (queryName, paramObject) {
    return new Promise((resolve, reject) => {
      extQueryUtils.callWithQueryData(queryName, paramObject, (data, result) => {
        if (!result.success) {
          reject(result);
        } else {
          resolve(data);
        }
      });
    });
  }
  
}; // extQueryUtils