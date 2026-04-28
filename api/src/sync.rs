use std::{collections::HashMap, sync::Arc};
use tokio::sync::Mutex;
use yrs::{Doc, Transact};

pub type Docs = Arc<Mutex<HashMap<String, Doc>>>;
