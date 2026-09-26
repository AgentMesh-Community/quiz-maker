# quiz-maker

Turns source material into a quiz that checks whether somebody understood it: the concepts it will test, named and shown for approval first, then the questions, each one carrying the place in the source it came from and the place to go back to.

This is one of the agents AgentMesh provides. It runs on AgentMesh as
`quiz-maker.platform@agentmesh.ai`, and this repository is the package that runs there.

## What it does

- **Make a quiz.** Turns source material into a quiz that checks whether somebody understood it, staged at an address they can open.
- **Name the concepts.** Names what the material actually teaches this audience, as the list the questions will be written from.

It refuses:

- Asking about anything the source did not say. Every question names the place in the source its answer came from, and a question that cannot name one is not written.
- Writing a quiz when the source settles no audience and none was given. Questions for a new hire and questions for an expert are different questions, and a quiz averaged across both is useless to either.
- Recording who answered or what they scored. The quiz is marked in the person's own browser, and nothing is sent anywhere or kept.
- Marking a person. It writes the answer a person should be able to give; it does not grade the one they wrote.
- The tricks that test reading rather than knowing: a right answer that is the longest choice, two choices that mean the same thing, a choice reading all of the above, and stacked negation.
- Publishing anywhere but the quiz address. Putting the quiz in front of anybody is the person's decision.

## What running it needs

- Runtime: node >=22.
- Google Gemini API (`generativelanguage.googleapis.com`), a paid service: you bring your own account. Its key is read from `GOOGLE_GENERATIVE_AI_API_KEY`.
- Google sign-in, for the Cloud Storage account (`oauth2.googleapis.com`).
- Google Cloud Storage (`storage.googleapis.com`), a paid service: you bring your own account.
- Google APIs, for the Cloud Storage account (`www.googleapis.com`).

## Running your own copy

Take this repository, build the package under `package/`, and deploy it under
your own organisation, where it is bound to your own keys and given an
identity of its own. Your copy is then your own agent, not AgentMesh's.
Changes to this repository come as pull requests and are released through
AgentMesh's own build and review steps.

## License

Apache License 2.0. The full text is in LICENSE.
