## IndiaMART Auto Product Agent

This project delivers a web-based automation console for bulk publishing catalogue items to IndiaMART. It combines a rich product drafting form, CSV importer, and an automation queue that can run in either simulation or live upload mode.

### Features

- Guided product drafting form with optional auto-generated descriptions.
- Queue-based agent that pushes items sequentially and logs each attempt.
- CSV importer with template download for rapid bulk loading.
- Simulation mode for payload validation before going live.
- Configurable IndiaMART endpoint, auth token, and seller/profile identifier.

### Quick Start

Install dependencies and launch the local development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the agent console. Use the control center on the right to supply your IndiaMART credentials and toggle between simulation and live uploads.

### CSV Format

The importer expects the following header order:

```
title,category,price,currency,unit,stock,minorderqty,keywords,imageurls,shortdescription,description,features,packaging,leadtime
```

Fields that contain commas must be wrapped in double quotes. A downloadable `sample.csv` is available from the UI.

### Production Build

```bash
npm run build
npm run start
```

### Deployment

The project is optimized for Vercel. After verifying locally, deploy with:

```bash
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-8edd1fd7
```
