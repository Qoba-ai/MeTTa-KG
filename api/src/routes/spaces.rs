use core::str;
use diesel::{ExpressionMethods, RunQueryDsl};
use mork_bytestring::{item_byte, Expr, ExprZipper, Tag};
use mork_frontend::bytestring_parser::{Context, Parser, ParserError};
use pathmap::trie_map::BytesTrieMap;
use pathmap::zipper::{ReadZipperUntracked, WriteZipper, WriteZipperUntracked, Zipper};
use rocket::http::Status;
use rocket::serde::json::Json;
use serde::Serialize;
use std::cmp::Ordering;
use std::collections::HashSet;

use rocket::{get, post};
use std::path::PathBuf;

use crate::{db::establish_connection, model::Space, model::Token};

struct DataParser {
    count: u64,
    symbols: BytesTrieMap<u64>,
}

impl DataParser {
    fn new() -> Self {
        Self {
            count: 3,
            symbols: BytesTrieMap::new(),
        }
    }

    const EMPTY: &'static [u8] = &[];
}

#[derive(Serialize)]
pub struct SpaceExt {
    pub space: Vec<String>,
    pub paths: Vec<Vec<String>>,
}

impl Parser for DataParser {
    fn tokenizer<'r>(&mut self, s: &[u8]) -> &'r [u8] {
        // return unsafe { std::mem::transmute(s) };
        if s.len() == 0 {
            return Self::EMPTY;
        }
        let mut z = self.symbols.write_zipper_at_path(s);
        let r = z.get_value_or_insert_with(|| {
            self.count += 1;
            u64::from_be(self.count)
        });
        let bs = (8 - r.trailing_zeros() / 8) as usize;
        let l = bs.max(1);
        unsafe {
            std::slice::from_raw_parts_mut(
                (r as *mut u64 as *mut u8).byte_offset((8 - l) as isize),
                l,
            )
        }
    }
}

fn metta_to_pathmap(metta: &str) -> BytesTrieMap<u32> {
    let mut pathmap: BytesTrieMap<u32> = BytesTrieMap::new();

    let mut parser = DataParser::new();

    let mut it = Context::new(metta.as_bytes());
    let mut stack = [0u8; 1 << 19];

    loop {
        let mut ez = ExprZipper::new(Expr {
            ptr: stack.as_mut_ptr(),
        });
        match parser.sexpr(&mut it, &mut ez) {
            Ok(()) => {
                pathmap.insert(&stack[..ez.loc], 0);
            }
            Err(ParserError::InputFinished) => break,
            Err(other) => {
                panic!("{:?}", other)
            }
        }

        it.variables.clear();
    }

    return pathmap;
}

fn descend_path<'a, 'path, V: Clone + Send + Sync>(
    z: &mut WriteZipperUntracked<V>,
    url_path: &'path PathBuf,
) -> () {
    for component in url_path.components() {
        let segment = component.as_os_str().to_str().unwrap();

        let mut path = vec![
            item_byte(Tag::Arity(2)),
            item_byte(Tag::SymbolSize(segment.len() as u8)),
        ];

        path.extend(segment.as_bytes());

        z.descend_to(&path);
    }
}

fn serialize<V: Clone + Send + Sync>(z: ReadZipperUntracked<V>) -> Vec<String> {
    return z
        .make_map()
        .unwrap()
        .iter()
        .map(|(k, _v)| {
            Expr {
                ptr: k.as_ptr().cast_mut(),
            }
            .string()
        })
        .collect::<Vec<String>>();
}

fn get_paths<'a, V: Clone + Send + Sync>(z: &mut ReadZipperUntracked<V>) -> Vec<Vec<String>> {
    let mut paths: Vec<Vec<String>> = vec![];

    let m: Option<BytesTrieMap<V>> = z.make_map();

    if !z.path_exists() || m.is_none() {
        return paths;
    }

    for (k, _v) in m.unwrap().iter() {
        let mut expr_zipper = ExprZipper::new(Expr {
            ptr: k.as_ptr().cast_mut(),
        });

        let mut stack: Vec<String> = vec![];

        loop {
            match expr_zipper.item() {
                Ok(Tag::SymbolSize(s)) => break,
                Ok(Tag::Arity(2)) => {
                    expr_zipper.next();
                    stack.push(expr_zipper.item_str());
                    paths.push(stack.clone());
                    expr_zipper.next();
                }
                Ok(Tag::Arity(n)) => break,
                Ok(Tag::NewVar) => break,
                Ok(Tag::VarRef(r)) => break,
                Err(_) => break,
            }
        }

        let unique_paths: HashSet<Vec<String>> = paths.drain(..).collect();
        paths.extend(unique_paths);
        /*
        paths.sort_by(|a, b| {
            if a.starts_with(b) {
                return Ordering::Greater;
            } else if b.starts_with(a) {
                return Ordering::Less;
            }

            return Ordering::Equal;
        }); */
    }

    return paths;
}

#[get("/spaces/<path..>")]
pub fn get(token: Token, path: PathBuf) -> Result<Json<SpaceExt>, Status> {
    use crate::schema::spaces::dsl::*;
    let conn = &mut establish_connection();

    if !path.starts_with(&token.namespace.strip_prefix("/").unwrap()) || !token.permission_read {
        return Err(Status::Unauthorized);
    }

    let root_space = spaces.first::<Space>(conn).unwrap();

    let mut pathmap = metta_to_pathmap(root_space.metta.as_str());

    let mut wz: WriteZipperUntracked<'_, '_, u32> = pathmap.write_zipper();

    descend_path::<u32>(&mut wz, &path);

    let mut rzz = wz.fork_read_zipper();

    let paths = get_paths(&mut rzz);

    if rzz.path_exists() {
        let serialized = serialize(rzz);

        return Ok(Json(SpaceExt {
            space: serialized,
            paths: paths,
        }));
    }

    return Ok(Json(SpaceExt {
        space: vec![],
        paths: vec![],
    }));
}

#[post("/spaces/<path..>", data = "<space>")]
pub fn write(token: Token, path: PathBuf, space: String) -> Result<Json<bool>, Status> {
    use crate::schema::spaces::dsl::*;
    let conn = &mut establish_connection();

    if !path.starts_with(&token.namespace.strip_prefix("/").unwrap()) || !token.permission_write {
        return Err(Status::Unauthorized);
    }

    let root_space = spaces.first::<Space>(conn).unwrap();

    let mut pathmap = metta_to_pathmap(&root_space.metta);
    let subspace_pathmap = metta_to_pathmap(space.as_str());

    let mut wz = pathmap.write_zipper();

    descend_path(&mut wz, &path);

    wz.join(&subspace_pathmap.read_zipper());

    // TODO: figure out better way to go back to the root
    wz.ascend(100);
    // wz.reset();

    let serialized = serialize(wz.fork_read_zipper());

    let update_result = diesel::update(spaces)
        .filter(id.eq(1))
        .set(metta.eq(serialized.join("\n")))
        .execute(conn);

    match update_result {
        Ok(_) => Ok(Json(true)),
        Err(_) => Err(Status::InternalServerError),
    }
}
