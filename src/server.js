/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import express from "express";
import cors from "cors";
import { decryptRequest, encryptResponse } from "./encryption.js";
import {
  getResponse,
  CheckoutButtonTemplateEndpointException,
} from "./endpoint.js";
import crypto from "crypto";

const app = express();
app.use(cors());

app.use(express.static("public"));

app.use(
  express.json({
    // store the raw request body to use it for signature verification
    verify: (req, res, buf, encoding) => {
      req.rawBody = buf?.toString(encoding || "utf8");
    },
  })
);

const { APP_SECRET, PRIVATE_KEY, PASSPHRASE = "", PORT = "3000" } = process.env;

app.post("/", async (req, res) => {
  if (!PRIVATE_KEY) {
    throw new Error(
      'Private key is empty. Please check your env variable "PRIVATE_KEY".'
    );
  }

  if (!isRequestSignatureValid(req)) {
    // Return status code 432 if request signature does not match.
    // To learn more about return error codes visit: https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
    return res.status(432).send();
  }

  let decryptedRequest = null;
  try {
    decryptedRequest = decryptRequest(req.body, PRIVATE_KEY, PASSPHRASE);
  } catch (err) {
    throw new Error(
      'Unable to decrypt the request. Please check your env variable "PRIVATE_KEY" is valid'
    );
    return;
  }

  const { aesKeyBuffer, initialVectorBuffer, decryptedBody } = decryptedRequest;
  console.log("💬 Decrypted Request:", decryptedBody);

  // TODO: Uncomment this block and add your flow token validation logic.
  // If the flow token becomes invalid, return HTTP code 427 to disable the flow and show the message in `error_msg` to the user
  // Refer to the docs for details https://developers.facebook.com/docs/whatsapp/flows/reference/error-codes#endpoint_error_codes
  if (!isValidEndpointToken(decryptedBody.flow_token)) {
    const error_response = {
      error_msg: `This is an invalid data exchange request message from endpoint`,
    };
    return res
      .status(427)
      .send(encryptResponse(error_response, aesKeyBuffer, initialVectorBuffer));
  }

  try {
    const screenResponse = await getResponse(decryptedBody);
    console.log("👉 Response to Encrypt:", screenResponse);
    res.send(
      encryptResponse(screenResponse, aesKeyBuffer, initialVectorBuffer)
    );
  } catch (err) {
    sendErrorResponse(res, err, aesKeyBuffer, initialVectorBuffer);
    return;
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here. Checkout README.md to start.</pre>`);
});

app.listen(PORT, () => {
  console.log(`Server is listening on port: ${PORT}`);
});

function isValidEndpointToken(flowToken) {
  return true;
}

function sendErrorResponse(res, err, aesKeyBuffer, initialVectorBuffer) {
  console.error(err);
  if (err instanceof CheckoutButtonTemplateEndpointException) {
    return res
      .status(err.statusCode)
      .send(encryptResponse(err.response, aesKeyBuffer, initialVectorBuffer));
  }
  return res.status(500).send();
}

function isRequestSignatureValid(req) {
  if (!APP_SECRET) {
    console.warn(
      "App Secret is not set up. Please Add your app secret in /.env file to check for request validation"
    );
    return true;
  }

  const signatureHeader = req.get("x-hub-signature-256");
  const signatureBuffer = Buffer.from(
    signatureHeader.replace("sha256=", ""),
    "utf-8"
  );

  const hmac = crypto.createHmac("sha256", APP_SECRET);
  const digestString = hmac.update(req.rawBody).digest("hex");
  const digestBuffer = Buffer.from(digestString, "utf-8");

  if (!crypto.timingSafeEqual(digestBuffer, signatureBuffer)) {
    console.error("Error: Request Signature did not match");
    return false;
  }
  return true;
}
