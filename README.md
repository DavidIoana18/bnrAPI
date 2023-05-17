USE NODE.JS VERSION 14
 
 
GET http://localhost:3000/currencies/2023-05-16  --> for get currencies 

POST http://localhost:3000/configure-currencies --> set the currencies do you want to save to googleDrive

body --> raw --> json --> 

{
    "currencies": ["AED", "AUD", "BGN", "BRL", "CAD", "CHF"]
}

POST http://localhost:3000/login --> 

body --> raw --> json --> 

{
  "username": "test",
  "password": "test"
}

GET http://localhost:3000/analytics --> after the login is done

headers -->

Authorization Bearer YOUR_TOKEN_FROM_LOGIN_ENDPOINT

